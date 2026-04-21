package com.example.pricecomparer.db;

import com.example.pricing.core.MarketSnapshot;
import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingResult;
import com.example.pricing.core.PricingStrategyEngine;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.example.pricecomparer.db.DbValueUtils.benchmarkPrice;
import static com.example.pricecomparer.db.DbValueUtils.dec;
import static com.example.pricecomparer.db.DbValueUtils.intOrNull;
import static com.example.pricecomparer.db.DbValueUtils.listOfMaps;
import static com.example.pricecomparer.db.DbValueUtils.mapOrNull;
import static com.example.pricecomparer.db.DbValueUtils.normEan;
import static com.example.pricecomparer.db.DbValueUtils.normKey;
import static com.example.pricecomparer.db.DbValueUtils.normUid;
import static com.example.pricecomparer.db.DbValueUtils.str;

@Service
public class DbPricingService {

    private static final String SCRAPED_SOURCE = "SCRAPED";

    private final JdbcTemplate jdbc;
    private final PricingStrategyEngine engine;
    private final DbMarketViewService marketViewService;

    public DbPricingService(JdbcTemplate jdbc, PricingStrategyEngine engine, DbMarketViewService marketViewService) {
        this.jdbc = jdbc;
        this.engine = engine;
        this.marketViewService = marketViewService;
    }

    public Map<String, Object> productViewByEan(String eanRaw) {
        String ean = normEan(eanRaw);
        if (ean.isBlank()) return ApiResponses.error("BAD_REQUEST", "ean is required");

        Map<String, Object> company = latestCompanyListingByEan(ean);
        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, null);
        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
        List<Map<String, Object>> offers = listOfMaps(market.get("offers"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ean", ean);
        out.put("company", company);
        out.put("display", company == null ? null : marketViewService.buildDisplay(company, offers));
        out.put("snapshot", snapshot);
        out.put("recommendedPrice", company != null && snapshot != null ? computeRecommended(company, snapshot) : null);
        out.put("offers", offers);
        out.put("marketSource", SCRAPED_SOURCE);
        return ApiResponses.ok(out);
    }

    public Map<String, Object> productViewByCompanyId(long companyId) {
        Map<String, Object> company = loadCompanyListing(companyId);
        if (company == null) return ApiResponses.error("NOT_FOUND", "company_listing not found");

        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(
                normEan(str(company.get("ean"))),
                normKey(str(company.get("mpn")))
        );
        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
        List<Map<String, Object>> offers = listOfMaps(market.get("offers"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("company", company);
        out.put("display", marketViewService.buildDisplay(company, offers));
        out.put("snapshot", snapshot);
        out.put("recommendedPrice", snapshot == null ? null : computeRecommended(company, snapshot));
        out.put("offers", offers);
        out.put("marketSource", SCRAPED_SOURCE);
        return ApiResponses.ok(out);
    }

    @Transactional
    public Map<String, Object> applyAutoByCompanyListingId(long companyListingId) {
        Map<String, Object> company = loadCompanyListingForPricing(companyListingId);
        if (company == null) return ApiResponses.error("NOT_FOUND", "company_listing not found");

        String mode = company.get("price_mode") == null ? "AUTO" : String.valueOf(company.get("price_mode")).toUpperCase(Locale.ROOT);
        if ("MANUAL".equals(mode)) return ApiResponses.error("CONFLICT", "priceMode=MANUAL; refusing to overwrite");

        String ean = normEan(str(company.get("ean")));
        String mpn = normKey(str(company.get("mpn")));
        if (ean.isBlank() && (mpn == null || mpn.isBlank())) return ApiResponses.error("BAD_REQUEST", "listing has no ean or mpn");

        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, mpn);
        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
        if (snapshot == null) {
            Map<String, Object> out = ApiResponses.error("NO_MATCH", "No matching scraped market data found");
            out.put("ean", ean);
            out.put("mpn", mpn);
            return out;
        }

        BigDecimal recommended = computeRecommended(company, snapshot);
        if (recommended == null || recommended.signum() <= 0) {
            Map<String, Object> out = ApiResponses.error("NO_RECOMMENDED", "could not compute recommended price");
            out.put("ean", ean);
            out.put("mpn", mpn);
            return out;
        }

        int updated = jdbc.update("""
            update company_listings
            set our_price = ?, last_updated = now()
            where id = ? and upper(coalesce(price_mode, 'AUTO')) <> 'MANUAL'
            """, recommended, companyListingId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("companyListingId", companyListingId);
        out.put("ean", ean);
        out.put("mpn", mpn);
        out.put("recommendedPrice", recommended);
        out.put("updated", updated > 0);
        out.put("snapshot", snapshot);
        return ApiResponses.ok(out);
    }

    @Transactional
    public Map<String, Object> recomputeAllAuto() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select id, company_sku, ean, mpn, price_mode, our_price, manual_price, cost_price
            from company_listings
            where upper(coalesce(price_mode, 'AUTO')) <> 'MANUAL'
            order by id asc
            """);

        int scanned = 0;
        int updated = 0;
        int skipped = 0;
        List<Map<String, Object>> failures = new java.util.ArrayList<>();

        for (Map<String, Object> row : rows) {
            scanned++;
            Long id = DbValueUtils.longOrNull(row.get("id"));
            if (id == null) {
                skipped++;
                continue;
            }

            String ean = normEan(str(row.get("ean")));
            String mpn = normKey(str(row.get("mpn")));
            Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, mpn);
            Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
            if (snapshot == null) {
                skipped++;
                failures.add(Map.of("id", id, "reason", "NO_MATCH"));
                continue;
            }

            BigDecimal recommended = computeRecommended(row, snapshot);
            if (recommended == null || recommended.signum() <= 0) {
                skipped++;
                failures.add(Map.of("id", id, "reason", "NO_RECOMMENDED"));
                continue;
            }

            updated += jdbc.update("update company_listings set our_price = ?, last_updated = now() where id = ?", recommended, id);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scanned", scanned);
        out.put("updated", updated);
        out.put("skipped", skipped);
        out.put("failures", failures);
        return ApiResponses.ok(out);
    }

    public Map<String, Object> scrapedProductViewByUid(String uidOrRowId) {
        String uid = marketViewService.resolveScrapedLookupKey(uidOrRowId);
        if (uid.isBlank()) return ApiResponses.error("BAD_REQUEST", "uid is required");

        Map<String, Object> market = marketViewService.getScrapedMarketByUid(uid);
        Map<String, Object> rollup = mapOrNull(market.get("rollup"));
        List<Map<String, Object>> offers = listOfMaps(market.get("offers"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("uid", uid);
        out.put("rollup", rollup);
        out.put("snapshot", market.get("snapshot"));
        out.put("offers", offers);
        out.put("display", buildScrapedDisplay(rollup, offers));
        out.put("marketSource", SCRAPED_SOURCE);
        return ApiResponses.ok(out);
    }

    public BigDecimal computeRecommendedFromInputs(
            String companySku,
            BigDecimal costPrice,
            BigDecimal currentPrice,
            BigDecimal benchmarkPrice,
            BigDecimal priceMin,
            BigDecimal priceMax,
            Integer offersCount
    ) {
        if (benchmarkPrice == null || benchmarkPrice.signum() <= 0) return null;
        PricingResult result = engine.price(
                new PricingContext(companySku, costPrice, currentPrice, new MarketSnapshot(priceMin, priceMax, offersCount), Map.of("source", "scraped")),
                benchmarkPrice
        );
        return result == null ? null : result.finalPrice();
    }

    private BigDecimal computeRecommended(Map<String, Object> company, Map<String, Object> snapshot) {
        BigDecimal cost = dec(company.get("cost_price"));
        BigDecimal current = effectiveCurrentPrice(company);
        BigDecimal marketMin = dec(snapshot.get("price_min"));
        BigDecimal marketMax = dec(snapshot.get("price_max"));
        Integer competitors = intOrNull(snapshot.get("offers_count"));
        BigDecimal base = benchmarkPrice(dec(snapshot.get("benchmark_price")), marketMin, marketMax);
        if (base == null) return null;

        PricingResult result = engine.price(
                new PricingContext(
                        str(company.get("company_sku")),
                        cost,
                        current,
                        new MarketSnapshot(marketMin, marketMax, competitors),
                        Map.of("source", "scraped")
                ),
                base
        );
        return result == null ? null : result.finalPrice();
    }

    private BigDecimal effectiveCurrentPrice(Map<String, Object> company) {
        String mode = str(company.get("price_mode"));
        BigDecimal manual = dec(company.get("manual_price"));
        if (mode != null && "MANUAL".equalsIgnoreCase(mode) && manual != null && manual.signum() > 0) {
            return manual;
        }
        return dec(company.get("our_price"));
    }

    private Map<String, Object> buildScrapedDisplay(Map<String, Object> rollup, List<Map<String, Object>> offers) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", firstNonBlank(rollup, offers, "display_name", "name"));
        out.put("ean", firstNonBlank(rollup, offers, "ean", "ean"));
        out.put("mpn", firstNonBlank(rollup, offers, "mpn", "mpn"));
        out.put("brand", firstNonBlank(rollup, offers, "brand", "brand"));
        return out;
    }

    private String firstNonBlank(Map<String, Object> rollup, List<Map<String, Object>> offers, String rollupKey, String offerKey) {
        String fromRollup = rollup == null ? null : str(rollup.get(rollupKey));
        if (fromRollup != null && !fromRollup.isBlank()) return fromRollup;
        return offers.isEmpty() ? null : str(offers.getFirst().get(offerKey));
    }

    private Map<String, Object> latestCompanyListingByEan(String ean) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from company_listings where ean = ? order by last_updated desc nulls last limit 1", ean);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private Map<String, Object> loadCompanyListing(long companyId) {
        try {
            return jdbc.queryForMap("select * from company_listings where id = ?", companyId);
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }

    private Map<String, Object> loadCompanyListingForPricing(long companyId) {
        try {
            return jdbc.queryForMap("""
                select id, company_sku, ean, mpn, price_mode, our_price, manual_price, cost_price
                from company_listings
                where id = ?
                """, companyId);
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }
}
