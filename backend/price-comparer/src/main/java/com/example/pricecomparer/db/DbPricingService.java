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
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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

    private final JdbcTemplate jdbc;
    private final PricingStrategyEngine engine;
    private final DbMarketViewService marketViewService;

    public DbPricingService(JdbcTemplate jdbc,
                            PricingStrategyEngine engine,
                            DbMarketViewService marketViewService) {
        this.jdbc = jdbc;
        this.engine = engine;
        this.marketViewService = marketViewService;
    }

    public Map<String, Object> productViewByEan(String eanRaw) {
        String ean = normEan(eanRaw);
        if (ean.isBlank()) {
            return Map.of("ok", false, "error", "BAD_REQUEST", "message", "ean is required");
        }

        Map<String, Object> company = latestCompanyListingByEan(ean);
        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, null);

        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
        List<Map<String, Object>> offers = listOfMaps(market.get("offers"));

        BigDecimal recommended = null;
        if (company != null && snapshot != null) {
            recommended = computeRecommended(company, snapshot);
        }

        return Map.of(
                "ok", true,
                "ean", ean,
                "company", company,
                "display", company == null ? null : marketViewService.buildDisplay(company, offers),
                "snapshot", snapshot,
                "recommendedPrice", recommended,
                "offers", offers,
                "marketSource", "SCRAPED"
        );
    }

    public Map<String, Object> productViewByCompanyId(long companyId) {
        Map<String, Object> company = loadCompanyListing(companyId);
        if (company == null) {
            return Map.of("ok", false, "error", "NOT_FOUND", "message", "company_listing not found");
        }

        String ean = normEan(str(company.get("ean")));
        String mpn = normKey(str(company.get("mpn")));

        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, mpn);
        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));
        List<Map<String, Object>> offers = listOfMaps(market.get("offers"));

        BigDecimal recommended = null;
        if (snapshot != null) {
            recommended = computeRecommended(company, snapshot);
        }

        return Map.of(
                "ok", true,
                "company", company,
                "display", marketViewService.buildDisplay(company, offers),
                "snapshot", snapshot,
                "recommendedPrice", recommended,
                "offers", offers,
                "marketSource", "SCRAPED"
        );
    }

    @Transactional
    public Map<String, Object> applyAutoByCompanyListingId(long companyListingId) {
        Map<String, Object> company = loadCompanyListingForPricing(companyListingId);
        if (company == null) {
            return Map.of("ok", false, "error", "NOT_FOUND", "message", "company_listing not found");
        }

        String mode = company.get("price_mode") == null
                ? "AUTO"
                : String.valueOf(company.get("price_mode")).toUpperCase(Locale.ROOT);

        if ("MANUAL".equals(mode)) {
            return Map.of("ok", false, "error", "CONFLICT", "message", "priceMode=MANUAL; refusing to overwrite");
        }

        String ean = normEan(str(company.get("ean")));
        String mpn = normKey(str(company.get("mpn")));

        if (ean.isBlank() && (mpn == null || mpn.isBlank())) {
            return Map.of("ok", false, "error", "BAD_REQUEST", "message", "listing has no ean or mpn");
        }

        Map<String, Object> market = marketViewService.getScrapedMarketByEanOrMpn(ean, mpn);
        Map<String, Object> snapshot = mapOrNull(market.get("snapshot"));

        if (snapshot == null) {
            return Map.of(
                    "ok", false,
                    "error", "NO_MATCH",
                    "message", "No matching scraped market data found",
                    "ean", ean,
                    "mpn", mpn
            );
        }

        BigDecimal recommended = computeRecommended(company, snapshot);
        if (recommended == null || recommended.signum() <= 0) {
            return Map.of(
                    "ok", false,
                    "error", "NO_RECOMMENDED",
                    "message", "could not compute recommended price",
                    "ean", ean,
                    "mpn", mpn
            );
        }

        int updated = jdbc.update("""
            update company_listings
            set our_price = ?,
                last_updated = now()
            where id = ?
              and upper(coalesce(price_mode, 'AUTO')) = 'AUTO'
        """, recommended, companyListingId);

        return Map.of(
                "ok", true,
                "id", companyListingId,
                "ean", ean,
                "mpn", mpn,
                "recommendedPrice", recommended,
                "updated", updated,
                "marketSource", "SCRAPED"
        );
    }

    public Map<String, Object> scrapedProductViewByUid(String uidRaw) {
        String uid = normUid(uidRaw);
        if (uid.isBlank()) {
            return Map.of("ok", false, "error", "BAD_REQUEST", "message", "uid is required");
        }

        String lookupKey = marketViewService.resolveScrapedLookupKey(uid);
        Map<String, Object> scrapedView = marketViewService.getScrapedMarketByUid(lookupKey);

        return Map.of(
                "ok", true,
                "uid", lookupKey,
                "rollup", scrapedView.get("rollup"),
                "snapshot", scrapedView.get("snapshot"),
                "offers", scrapedView.get("offers")
        );
    }

    @Transactional
    public Map<String, Object> recomputeAllAuto() {
        List<Long> ids = jdbc.queryForList("""
            select id
            from company_listings
            where upper(coalesce(price_mode, 'AUTO')) = 'AUTO'
            order by id asc
        """, Long.class);

        int updated = 0;
        int noMatch = 0;
        int noRecommended = 0;
        int notFound = 0;
        int otherErrors = 0;

        List<Map<String, Object>> sampleFailures = new ArrayList<>();

        for (Long id : ids) {
            try {
                Map<String, Object> res = applyAutoByCompanyListingId(id);

                if (Boolean.TRUE.equals(res.get("ok"))) {
                    Object upd = res.get("updated");
                    if (upd instanceof Number n && n.intValue() > 0) {
                        updated++;
                    }
                    continue;
                }

                String error = String.valueOf(res.getOrDefault("error", "UNKNOWN"));
                switch (error) {
                    case "NO_MATCH" -> noMatch++;
                    case "NO_RECOMMENDED" -> noRecommended++;
                    case "NOT_FOUND" -> notFound++;
                    default -> otherErrors++;
                }

                if (sampleFailures.size() < 25) {
                    sampleFailures.add(Map.of(
                            "id", id,
                            "error", error,
                            "message", String.valueOf(res.getOrDefault("message", ""))
                    ));
                }
            } catch (Exception e) {
                otherErrors++;
                if (sampleFailures.size() < 25) {
                    Map<String, Object> fail = new LinkedHashMap<>();
                    fail.put("id", id);
                    fail.put("error", e.getClass().getSimpleName());
                    fail.put("message", e.getMessage() == null ? "No message available" : e.getMessage());
                    sampleFailures.add(fail);
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("candidates", ids.size());
        out.put("updated", updated);
        out.put("noMatch", noMatch);
        out.put("noRecommended", noRecommended);
        out.put("notFound", notFound);
        out.put("otherErrors", otherErrors);
        out.put("sampleFailures", sampleFailures);
        return out;
    }

    private BigDecimal computeRecommended(Map<String, Object> company, Map<String, Object> snapshot) {
        BigDecimal cost = dec(company.get("cost_price"));
        BigDecimal current = dec(company.get("our_price"));

        if (current == null || current.signum() <= 0) {
            BigDecimal manual = dec(company.get("manual_price"));
            if (manual != null && manual.signum() > 0) {
                current = manual;
            }
        }

        BigDecimal marketMin = dec(snapshot.get("price_min"));
        BigDecimal marketMax = dec(snapshot.get("price_max"));
        Integer competitors = intOrNull(snapshot.get("offers_count"));

        BigDecimal base = dec(snapshot.get("benchmark_price"));
        if (base == null || base.signum() <= 0) {
            base = dec(snapshot.get("price_median"));
        }
        if (base == null || base.signum() <= 0) {
            if (marketMin != null && marketMax != null && marketMin.signum() > 0 && marketMax.signum() > 0) {
                base = marketMin.add(marketMax).divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP);
            } else if (marketMin != null && marketMin.signum() > 0) {
                base = marketMin;
            } else if (marketMax != null && marketMax.signum() > 0) {
                base = marketMax;
            } else {
                return null;
            }
        }

        MarketSnapshot market = new MarketSnapshot(marketMin, marketMax, competitors);

        PricingContext ctx = new PricingContext(
                str(company.get("company_sku")),
                cost,
                current,
                market,
                Map.of("source", "scraped")
        );

        PricingResult result = engine.price(ctx, base);
        return result.finalPrice();
    }

    private Map<String, Object> latestCompanyListingByEan(String ean) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select *
            from company_listings
            where ean = ?
            order by last_updated desc nulls last
            limit 1
        """, ean);
        return rows.isEmpty() ? null : rows.get(0);
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
    public BigDecimal computeRecommendedFromInputs(
            String companySku,
            BigDecimal costPrice,
            BigDecimal currentPrice,
            BigDecimal benchmarkPrice,
            BigDecimal priceMin,
            BigDecimal priceMax,
            Integer offersCount
    ) {
        if (benchmarkPrice == null || benchmarkPrice.signum() <= 0) {
            return null;
        }

        MarketSnapshot market = new MarketSnapshot(priceMin, priceMax, offersCount);

        PricingContext ctx = new PricingContext(
                companySku,
                costPrice,
                currentPrice,
                market,
                Map.of("source", "scraped")
        );

        PricingResult result = engine.price(ctx, benchmarkPrice);
        return result == null ? null : result.finalPrice();
    }
}