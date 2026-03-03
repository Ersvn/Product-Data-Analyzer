package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.CompareResponse;
import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@RestController
public class CompareController {

    private final DataStoreService store;
    private final JdbcTemplate jdbc;

    @Value("${app.storage:FILES}")
    private String storage;

    public CompareController(DataStoreService store, JdbcTemplate jdbc) {
        this.store = store;
        this.jdbc = jdbc;
    }

    @GetMapping("/api/compare")
    public CompareResponse compare(@RequestParam Map<String, String> query) {
        String q = String.valueOf(query.getOrDefault("q", "")).trim().toLowerCase(Locale.ROOT);

        // DB mode -> query Postgres directly (source of truth)
        if ("DB".equalsIgnoreCase(String.valueOf(storage).trim())) {
            return compareFromDb(q);
        }

        // FILES/legacy mode -> keep previous behavior
        return compareFromInMemory(q);
    }

    private CompareResponse compareFromDb(String q) {
        boolean hasQ = q != null && !q.isBlank();
        String like = "%" + (hasQ ? q : "") + "%";

        String baseSql = """
            select
              c.id                 as company_id,
              c.company_sku        as company_sku,
              c.ean                as ean,
              c.mpn                as company_mpn,
              c.name               as company_name,
              c.brand              as company_brand,
              c.category           as company_category,
              c.our_price          as our_price,
              c.cost_price         as cost_price,
              c.price_mode         as price_mode,
              c.manual_price       as manual_price,
              c.last_updated       as last_updated,
              c.matched_product_id as matched_product_id,

              p.id                 as product_id,
              p.mpn                as market_mpn,
              p.name               as market_name,
              p.brand              as market_brand,
              p.category           as market_category,

              s.offers_count       as offers_count,
              s.price_min          as price_min,
              s.price_max          as price_max,
              s.price_median       as price_median,
              s.benchmark_price    as benchmark_price
            from company_listings c
            join products p on p.id = c.matched_product_id
            join product_market_snapshot s on s.product_id = p.id
            where c.matched_product_id is not null
        """;

        String filterSql = """
            and (
              lower(coalesce(c.ean,'')) like ?
              or lower(coalesce(c.company_sku,'')) like ?
              or lower(coalesce(c.mpn,'')) like ?
              or lower(coalesce(c.name,'')) like ?
              or lower(coalesce(c.brand,'')) like ?
              or lower(coalesce(c.category,'')) like ?
              or lower(coalesce(p.name,'')) like ?
              or lower(coalesce(p.brand,'')) like ?
              or lower(coalesce(p.category,'')) like ?
            )
        """;

        String orderSql = " order by c.id asc";

        List<Map<String, Object>> rows = hasQ
                ? jdbc.queryForList(baseSql + filterSql + orderSql,
                like, like, like, like, like, like, like, like, like)
                : jdbc.queryForList(baseSql + orderSql);

        List<CompareResponse.Matched> matched = new ArrayList<>(rows.size());

        for (Map<String, Object> r : rows) {
            String ean = str(r.get("ean"));

            Product cp = new Product();
            cp.id = longVal(r.get("company_id"));
            cp.ean = ean;
            cp.mpn = str(r.get("company_mpn"));
            cp.name = str(r.get("company_name"));
            cp.brand = str(r.get("company_brand"));
            cp.category = str(r.get("company_category"));
            cp.companySku = str(r.get("company_sku"));
            cp.ourPrice = dbl(r.get("our_price"));
            cp.costPrice = dbl(r.get("cost_price"));
            cp.manualPrice = dbl(r.get("manual_price"));
            cp.priceMode = safePriceMode(str(r.get("price_mode")));
            cp.matchedProductId = longVal(r.get("matched_product_id"));
            cp.lastUpdated = tsToIso(r.get("last_updated"));

            Product mp = new Product();
            mp.id = longVal(r.get("product_id"));
            mp.ean = ean;
            mp.mpn = str(r.get("market_mpn"));
            mp.name = str(r.get("market_name"));
            mp.brand = str(r.get("market_brand"));
            mp.category = str(r.get("market_category"));
            mp.offersCount = intVal(r.get("offers_count"));
            mp.priceMin = dbl(r.get("price_min"));
            mp.priceMax = dbl(r.get("price_max"));
            mp.priceMedian = dbl(r.get("price_median"));
            // store.getMarketBenchmarkPrice() i JSON-mode motsvaras av benchmark_price i DB
            mp.benchmarkPrice = dbl(r.get("benchmark_price"));

            double marketPrice = mp.benchmarkPrice != null ? mp.benchmarkPrice : 0.0;
            double companyPrice = store.getOurComparablePrice(cp) != null ? store.getOurComparablePrice(cp) : 0.0;
            double diff = companyPrice - marketPrice;

            matched.add(new CompareResponse.Matched(ean, mp, cp, diff));
        }

        matched.sort((a, b) -> Double.compare(b.priceDiff, a.priceDiff));

        CompareResponse out = new CompareResponse();
        out.matched = matched;

        // Keep these small in DB mode (UI använder främst matched + meta)
        out.onlyInMarket = List.of();
        out.onlyInCompany = List.of();

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("lastLoadedAt", Instant.now().toString());
        meta.put("marketTotal", safeCount("select count(*) from products"));
        meta.put("companyTotal", safeCount("select count(*) from company_listings"));
        meta.put("matched", matched.size());
        meta.put("onlyInMarket", safeCount("""
            select count(*)
            from products p
            join product_market_snapshot s on s.product_id = p.id
            left join company_listings c on c.ean = p.ean
            where c.id is null
        """));
        meta.put("onlyInCompany", safeCount("select count(*) from company_listings where matched_product_id is null"));
        out.meta = meta;

        return out;
    }

    private long safeCount(String sql) {
        try {
            Long v = jdbc.queryForObject(sql, Long.class);
            return v == null ? 0L : v;
        } catch (Exception e) {
            return 0L;
        }
    }

    /* =========================================================
       In-memory compare (FILES/legacy)
       ========================================================= */

    private CompareResponse compareFromInMemory(String q) {
        Map<String, Product> m = store.marketIndex();
        Map<String, Product> c = store.companyIndex();

        if (m == null) m = Collections.emptyMap();
        if (c == null) c = Collections.emptyMap();

        Set<String> allEans = new HashSet<>();
        allEans.addAll(m.keySet());
        allEans.addAll(c.keySet());

        List<CompareResponse.Matched> matched = new ArrayList<>();
        List<Product> onlyInMarket = new ArrayList<>();
        List<Product> onlyInCompany = new ArrayList<>();

        for (String ean : allEans) {
            Product mp = m.get(ean);
            Product cp = c.get(ean);

            boolean passesQ = q == null || q.isBlank() || anyContains(q,
                    mp == null ? null : mp.name, mp == null ? null : mp.brand, mp == null ? null : mp.category, mp == null ? null : mp.store, ean,
                    cp == null ? null : cp.name, cp == null ? null : cp.brand, cp == null ? null : cp.category, cp == null ? null : cp.store, ean
            );
            if (!passesQ) continue;

            if (mp != null && cp != null) {
                double marketPrice = pickMarketBenchmark(cp, mp);
                double companyPrice = pickCompanyComparable(cp);
                double diff = companyPrice - marketPrice;
                matched.add(new CompareResponse.Matched(ean, mp, cp, diff));
            } else if (mp != null) {
                onlyInMarket.add(mp);
            } else if (cp != null) {
                onlyInCompany.add(cp);
            }
        }

        matched.sort((a, b) -> Double.compare(b.priceDiff, a.priceDiff));

        CompareResponse out = new CompareResponse();
        out.matched = matched;
        out.onlyInMarket = onlyInMarket;
        out.onlyInCompany = onlyInCompany;

        Map<String, Object> meta = new LinkedHashMap<>();
        Object lastLoadedAt = store.getLastLoadedAt();
        meta.put("lastLoadedAt", lastLoadedAt == null ? "" : String.valueOf(lastLoadedAt));

        List<Product> marketList = store.market();
        List<Product> companyList = store.company();

        meta.put("marketTotal", marketList == null ? 0 : marketList.size());
        meta.put("companyTotal", companyList == null ? 0 : companyList.size());
        meta.put("matched", matched.size());
        meta.put("onlyInMarket", onlyInMarket.size());
        meta.put("onlyInCompany", onlyInCompany.size());

        out.meta = meta;
        return out;
    }

    private double pickMarketBenchmark(Product cp, Product mp) {
        Double bench = store.getMarketBenchmarkPrice(cp);
        if (bench != null && bench > 0) return bench;

        if (mp == null) return 0.0;
        Double min = mp.priceMin;
        Double max = mp.priceMax;

        if (min != null && max != null && min > 0 && max > 0) return (min + max) / 2.0;
        if (min != null && min > 0) return min;
        if (max != null && max > 0) return max;
        if (mp.price > 0) return mp.price;

        return 0.0;
    }

    private double pickCompanyComparable(Product cp) {
        Double our = store.getOurComparablePrice(cp);
        if (our != null && our > 0) return our;
        return 0.0;
    }

    private boolean anyContains(String needle, String... vals) {
        for (String v : vals) {
            if (v == null) continue;
            if (v.toLowerCase(Locale.ROOT).contains(needle)) return true;
        }
        return false;
    }

    /* =========================================================
       Small helpers
       ========================================================= */

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long longVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static Integer intVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static Double dbl(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static String tsToIso(Object o) {
        if (o == null) return null;
        if (o instanceof Timestamp ts) return ts.toInstant().toString();
        try { return String.valueOf(o); } catch (Exception e) { return null; }
    }

    private static com.example.pricecomparer.domain.PriceMode safePriceMode(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return com.example.pricecomparer.domain.PriceMode.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            return null;
        }
    }
}