package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.CompareResponse;
import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@RestController
public class CompareController {

    private final JdbcTemplate jdbc;

    public CompareController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/compare")
    public CompareResponse compare(@RequestParam Map<String, String> query) {
        String q = String.valueOf(query.getOrDefault("q", "")).trim().toLowerCase(Locale.ROOT);
        return compareFromDb(q);
    }

    private CompareResponse compareFromDb(String q) {
        boolean hasQ = q != null && !q.isBlank();
        String like = "%" + (hasQ ? q : "") + "%";

        String sql = """
            with market as (
              select *
              from scraped_market_rollup
            ),
            joined as (
              select
                c.id as company_id,
                c.company_sku,
                c.ean,
                c.mpn as company_mpn,
                c.name as company_name,
                c.brand as company_brand,
                c.category as company_category,
                c.our_price,
                c.cost_price,
                c.price_mode,
                c.manual_price,
                c.last_updated,

                m.uid as market_uid,
                m.mpn as market_mpn,
                m.display_name as market_name,
                m.brand as market_brand,
                m.offers_count,
                m.price_min,
                m.price_max,
                m.price_median
              from company_listings c
              left join market m
                on m.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
                or m.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
            )
            select *
            from joined
            where market_uid is not null
        """;

        List<Map<String, Object>> rows = hasQ
                ? jdbc.queryForList(sql + """
                    and (
                      lower(coalesce(ean,'')) like ?
                      or lower(coalesce(company_sku,'')) like ?
                      or lower(coalesce(company_mpn,'')) like ?
                      or lower(coalesce(company_name,'')) like ?
                      or lower(coalesce(company_brand,'')) like ?
                      or lower(coalesce(company_category,'')) like ?
                      or lower(coalesce(market_name,'')) like ?
                      or lower(coalesce(market_brand,'')) like ?
                      or lower(coalesce(market_uid,'')) like ?
                    )
                    order by company_id asc
                """, like, like, like, like, like, like, like, like, like)
                : jdbc.queryForList(sql + " order by company_id asc");

        List<CompareResponse.Matched> matched = new ArrayList<>();

        for (Map<String, Object> r : rows) {
            Product cp = new Product();
            cp.id = longVal(r.get("company_id"));
            cp.ean = str(r.get("ean"));
            cp.mpn = str(r.get("company_mpn"));
            cp.name = str(r.get("company_name"));
            cp.brand = str(r.get("company_brand"));
            cp.category = str(r.get("company_category"));
            cp.companySku = str(r.get("company_sku"));
            cp.ourPrice = dbl(r.get("our_price"));
            cp.costPrice = dbl(r.get("cost_price"));
            cp.manualPrice = dbl(r.get("manual_price"));
            cp.priceMode = safePriceMode(str(r.get("price_mode")));
            cp.lastUpdated = tsToIso(r.get("last_updated"));

            Product mp = new Product();
            mp.ean = str(r.get("ean"));
            mp.mpn = str(r.get("market_mpn"));
            mp.name = str(r.get("market_name"));
            mp.brand = str(r.get("market_brand"));
            mp.offersCount = intVal(r.get("offers_count"));
            mp.priceMin = dbl(r.get("price_min"));
            mp.priceMax = dbl(r.get("price_max"));
            mp.priceMedian = dbl(r.get("price_median"));
            mp.benchmarkPrice = pickBenchmark(mp);

            double marketPrice = pickBenchmark(mp);
            double companyPrice = pickCompanyComparable(cp);
            double diff = companyPrice - marketPrice;

            matched.add(new CompareResponse.Matched(cp.ean, mp, cp, diff));
        }

        matched.sort((a, b) -> Double.compare(b.priceDiff, a.priceDiff));

        CompareResponse out = new CompareResponse();
        out.matched = matched;
        out.onlyInMarket = List.of();
        out.onlyInCompany = List.of();

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("lastLoadedAt", Instant.now().toString());
        meta.put("marketTotal", safeCount("select count(*) from scraped_market_rollup"));
        meta.put("companyTotal", safeCount("select count(*) from company_listings"));
        meta.put("matched", matched.size());
        meta.put("onlyInMarket", 0);
        meta.put("onlyInCompany", safeCount("""
            select count(*)
            from company_listings c
            left join scraped_market_rollup r
              on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
              or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
            where r.uid is null
        """));
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

    private double pickBenchmark(Product mp) {
        if (mp == null) return 0.0;
        if (mp.priceMedian != null && mp.priceMedian > 0) return mp.priceMedian;
        if (mp.priceMin != null && mp.priceMax != null && mp.priceMin > 0 && mp.priceMax > 0) {
            return (mp.priceMin + mp.priceMax) / 2.0;
        }
        if (mp.priceMin != null && mp.priceMin > 0) return mp.priceMin;
        if (mp.priceMax != null && mp.priceMax > 0) return mp.priceMax;
        return 0.0;
    }

    private double pickCompanyComparable(Product cp) {
        if (cp == null) return 0.0;
        if (cp.priceMode == PriceMode.MANUAL && cp.manualPrice != null && cp.manualPrice > 0) return cp.manualPrice;
        if (cp.ourPrice != null && cp.ourPrice > 0) return cp.ourPrice;
        if (cp.manualPrice != null && cp.manualPrice > 0) return cp.manualPrice;
        return 0.0;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long longVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); }
        catch (Exception e) { return null; }
    }

    private static Integer intVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o)); }
        catch (Exception e) { return null; }
    }

    private static Double dbl(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); }
        catch (Exception e) { return null; }
    }

    private static String tsToIso(Object o) {
        if (o == null) return null;
        if (o instanceof Timestamp ts) return ts.toInstant().toString();
        return String.valueOf(o);
    }

    private static PriceMode safePriceMode(String s) {
        if (s == null || s.isBlank()) return null;
        try { return PriceMode.valueOf(s.trim().toUpperCase(Locale.ROOT)); }
        catch (Exception e) { return null; }
    }
}