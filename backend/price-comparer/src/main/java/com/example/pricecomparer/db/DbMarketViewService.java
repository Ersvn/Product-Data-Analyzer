package com.example.pricecomparer.db;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.example.pricecomparer.db.DbValueUtils.dec;
import static com.example.pricecomparer.db.DbValueUtils.intOrNull;
import static com.example.pricecomparer.db.DbValueUtils.normEan;
import static com.example.pricecomparer.db.DbValueUtils.normKey;
import static com.example.pricecomparer.db.DbValueUtils.normUid;
import static com.example.pricecomparer.db.DbValueUtils.str;

@Service
public class DbMarketViewService {

    private final JdbcTemplate jdbc;

    public DbMarketViewService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> getScrapedMarketByEanOrMpn(String eanRaw, String mpnRaw) {
        String ean = normEan(eanRaw);
        if (!ean.isBlank()) {
            Map<String, Object> market = getScrapedMarketByUid(ean);
            if (hasMarket(market)) return market;
        }

        String mpn = normKey(mpnRaw);
        if (mpn != null && !mpn.isBlank()) {
            Map<String, Object> market = getScrapedMarketByUid(mpn);
            if (hasMarket(market)) return market;
        }

        return emptyMarket();
    }

    public Map<String, Object> getScrapedMarketByUid(String uidRaw) {
        String uid = normUid(uidRaw);
        if (uid.isBlank()) return emptyMarket();

        Map<String, Object> rollup = findRollup(uid);
        List<Map<String, Object>> offers = findOffers(uid);
        if (rollup == null && offers.isEmpty()) return emptyMarket();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("uid", uid);
        out.put("rollup", rollup);
        out.put("snapshot", buildSnapshot(rollup, offers));
        out.put("offers", offers);
        return out;
    }

    public String resolveScrapedLookupKey(String uidOrRowId) {
        String uid = normUid(uidOrRowId);
        if (uid.isBlank()) return "";
        if (hasMarket(getScrapedMarketByUid(uid))) return uid;

        try {
            long rowId = Long.parseLong(uidOrRowId);
            Map<String, Object> row = jdbc.queryForMap("select ean, mpn from active_products_with_price where id = ?", rowId);
            String ean = normEan(str(row.get("ean")));
            if (!ean.isBlank()) return ean;
            String mpn = normKey(str(row.get("mpn")));
            return mpn == null ? uid : mpn;
        } catch (Exception ignored) {
            return uid;
        }
    }

    public Map<String, Object> buildDisplay(Map<String, Object> company, List<Map<String, Object>> offers) {
        String name = firstNonBlank(str(company.get("name")), offers, "name");
        String ean = firstNonBlank(str(company.get("ean")), offers, "ean");
        String mpn = firstNonBlank(str(company.get("mpn")), offers, "mpn");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        out.put("ean", ean);
        out.put("mpn", mpn);
        return out;
    }

    private Map<String, Object> findRollup(String uid) {
        try {
            return jdbc.queryForMap("""
                select uid, display_name, brand, ean, mpn, offers_count, price_min, price_max, price_median, last_scraped
                from scraped_market_rollup
                where uid = ?
                """, uid);
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }

    private List<Map<String, Object>> findOffers(String uid) {
        return jdbc.queryForList("""
            select
              site_name as merchant,
              price,
              currency,
              in_stock,
              url,
              last_scraped as fetched_at,
              name,
              brand,
              ean,
              mpn
            from scraped_products
            where coalesce(ean_norm, mpn_norm, uid_norm) = ?
              and price is not null
              and price > 0
            order by price asc, last_scraped desc nulls last
            """, uid);
    }

    private Map<String, Object> buildSnapshot(Map<String, Object> rollup, List<Map<String, Object>> offers) {
        BigDecimal priceMin = rollup == null ? null : dec(rollup.get("price_min"));
        BigDecimal priceMax = rollup == null ? null : dec(rollup.get("price_max"));
        BigDecimal priceMedian = rollup == null ? null : dec(rollup.get("price_median"));
        Integer offersCount = rollup == null ? offers.size() : intOrNull(rollup.get("offers_count"));

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("offers_count", offersCount == null ? 0 : offersCount);
        snapshot.put("price_min", priceMin);
        snapshot.put("price_max", priceMax);
        snapshot.put("price_median", priceMedian);
        snapshot.put("benchmark_price", benchmark(priceMedian, priceMin, priceMax));
        return snapshot;
    }

    private BigDecimal benchmark(BigDecimal median, BigDecimal min, BigDecimal max) {
        if (median != null && median.signum() > 0) return median;
        if (min != null && min.signum() > 0 && max != null && max.signum() > 0) {
            return min.add(max).divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP);
        }
        if (min != null && min.signum() > 0) return min;
        if (max != null && max.signum() > 0) return max;
        return null;
    }

    private String firstNonBlank(String current, List<Map<String, Object>> offers, String key) {
        if (current != null && !current.isBlank()) return current;
        if (offers.isEmpty()) return current;
        return str(offers.getFirst().get(key));
    }

    private boolean hasMarket(Map<String, Object> market) {
        if (market == null) return false;
        return market.get("rollup") != null || !DbValueUtils.listOfMaps(market.get("offers")).isEmpty();
    }

    private Map<String, Object> emptyMarket() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("uid", null);
        out.put("rollup", null);
        out.put("snapshot", null);
        out.put("offers", List.of());
        return out;
    }
}
