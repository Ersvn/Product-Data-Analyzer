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
            Map<String, Object> byEan = getScrapedMarketByUid(ean);
            if (hasMarket(byEan)) return byEan;
        }

        String mpn = normKey(mpnRaw);
        if (mpn != null && !mpn.isBlank()) {
            Map<String, Object> byMpn = getScrapedMarketByUid(mpn);
            if (hasMarket(byMpn)) return byMpn;
        }

        return emptyMarket();
    }

    public Map<String, Object> getScrapedMarketByUid(String uidRaw) {
        String uid = normUid(uidRaw);
        if (uid.isBlank()) return emptyMarket();

        Map<String, Object> rollup;
        try {
            rollup = jdbc.queryForMap("""
                select
                  uid,
                  display_name,
                  brand,
                  ean,
                  mpn,
                  offers_count,
                  price_min,
                  price_max,
                  price_median,
                  last_scraped
                from scraped_market_rollup
                where uid = ?
            """, uid);
        } catch (EmptyResultDataAccessException ex) {
            rollup = null;
        }

        List<Map<String, Object>> offers = jdbc.queryForList("""
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

        if (rollup == null && offers.isEmpty()) {
            return emptyMarket();
        }

        BigDecimal priceMin = rollup == null ? null : dec(rollup.get("price_min"));
        BigDecimal priceMax = rollup == null ? null : dec(rollup.get("price_max"));
        BigDecimal priceMedian = rollup == null ? null : dec(rollup.get("price_median"));
        Integer offersCount = rollup == null ? offers.size() : intValue(rollup.get("offers_count"));

        BigDecimal benchmark = priceMedian;
        if ((benchmark == null || benchmark.signum() <= 0) && priceMin != null && priceMax != null) {
            benchmark = priceMin.add(priceMax).divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP);
        }
        if ((benchmark == null || benchmark.signum() <= 0) && priceMin != null) {
            benchmark = priceMin;
        }

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("offers_count", offersCount == null ? 0 : offersCount);
        snapshot.put("price_min", priceMin);
        snapshot.put("price_max", priceMax);
        snapshot.put("price_median", priceMedian);
        snapshot.put("benchmark_price", benchmark);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("uid", uid);
        out.put("rollup", rollup);
        out.put("snapshot", snapshot);
        out.put("offers", offers);
        return out;
    }

    public String resolveScrapedLookupKey(String uidOrRowId) {
        String uid = normUid(uidOrRowId);
        if (uid.isBlank()) return "";

        Map<String, Object> direct = getScrapedMarketByUid(uid);
        if (hasMarket(direct)) {
            return uid;
        }

        try {
            long rowId = Long.parseLong(uidOrRowId);

            Map<String, Object> row = jdbc.queryForMap("""
                select ean, mpn
                from active_products_with_price
                where id = ?
            """, rowId);

            String ean = normEan(str(row.get("ean")));
            if (!ean.isBlank()) return ean;

            String mpn = normKey(str(row.get("mpn")));
            return mpn == null ? uid : mpn;
        } catch (Exception ignored) {
            return uid;
        }
    }

    public Map<String, Object> buildDisplay(Map<String, Object> company, List<Map<String, Object>> offers) {
        String name = str(company.get("name"));
        String ean = str(company.get("ean"));
        String mpn = str(company.get("mpn"));

        if ((name == null || name.isBlank()) && !offers.isEmpty()) {
            name = str(offers.get(0).get("name"));
        }
        if ((ean == null || ean.isBlank()) && !offers.isEmpty()) {
            ean = str(offers.get(0).get("ean"));
        }
        if ((mpn == null || mpn.isBlank()) && !offers.isEmpty()) {
            mpn = str(offers.get(0).get("mpn"));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", name);
        out.put("ean", ean);
        out.put("mpn", mpn);
        return out;
    }

    private boolean hasMarket(Map<String, Object> market) {
        if (market == null) return false;
        Object rollup = market.get("rollup");
        Object offers = market.get("offers");
        return rollup != null || (offers instanceof List<?> list && !list.isEmpty());
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

    private Integer intValue(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }
}