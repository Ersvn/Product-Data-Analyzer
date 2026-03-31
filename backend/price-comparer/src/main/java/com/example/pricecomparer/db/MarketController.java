package com.example.pricecomparer.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class MarketController {

    private final JdbcTemplate jdbc;
    private final DbPricingService pricingSvc;

    public MarketController(JdbcTemplate jdbc, DbPricingService pricingSvc) {
        this.jdbc = jdbc;
        this.pricingSvc = pricingSvc;
    }

    @GetMapping("/api/db/market-list")
    public Map<String, Object> marketList(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "") String afterUid,
            @RequestParam(required = false) String q
    ) {
        limit = DbRequestParsers.clamp(limit, 1, 500);

        String query = DbRequestParsers.normalizeSearchLower(q);
        boolean hasQ = !query.isBlank();
        String like = "%" + query + "%";

        StringBuilder sql = new StringBuilder("""
            select
              cast(id as text) as uid,
              id,
              site_name,
              name,
              brand,
              ean,
              mpn,
              latest_price,
              previous_price,
              last_scraped,
              url
            from active_products_with_price
            where 1=1
        """);

        List<Object> args = new ArrayList<>();

        if (!afterUid.isBlank()) {
            long afterId = DbRequestParsers.parseLongOrDefault(afterUid, 0L);
            if (afterId > 0) {
                sql.append(" and id < ? ");
                args.add(afterId);
            }
        }

        if (hasQ) {
            sql.append("""
                and (
                  lower(coalesce(site_name,'')) like ?
                  or lower(coalesce(name,'')) like ?
                  or lower(coalesce(brand,'')) like ?
                  or lower(coalesce(ean,'')) like ?
                  or lower(coalesce(mpn,'')) like ?
                )
            """);
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
        }

        sql.append(" order by last_scraped desc nulls last, id desc limit ? ");
        args.add(limit);

        List<Map<String, Object>> items = jdbc.queryForList(sql.toString(), args.toArray());

        String nextAfterUid = afterUid;
        if (!items.isEmpty()) {
            Object last = items.get(items.size() - 1).get("id");
            nextAfterUid = last == null ? afterUid : String.valueOf(last);
        }

        return Map.of(
                "ok", true,
                "limit", limit,
                "afterUid", afterUid,
                "nextAfterUid", nextAfterUid,
                "q", query,
                "items", items
        );
    }

    @GetMapping("/api/db/scraped-market")
    public Map<String, Object> listScrapedMarket(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "") String afterUid,
            @RequestParam(required = false) String q
    ) {
        limit = DbRequestParsers.clamp(limit, 1, 500);

        String query = DbRequestParsers.normalizeSearchLower(q);
        boolean hasQ = !query.isBlank();
        String like = "%" + query + "%";

        StringBuilder sql = new StringBuilder("""
            select
              r.uid,
              r.display_name,
              r.brand,
              r.ean,
              r.mpn,
              r.offers_count,
              r.price_min,
              r.price_max,
              r.price_median,
              r.last_scraped,
              exists (
                select 1
                from company_listings c
                where
                  nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '') = r.uid
                  or nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '') = r.uid
              ) as inventory_matched
            from scraped_market_rollup r
            where 1=1
        """);

        List<Object> args = new ArrayList<>();

        if (hasQ) {
            sql.append("""
                and (
                  lower(coalesce(r.display_name,'')) like ?
                  or lower(coalesce(r.brand,'')) like ?
                  or lower(coalesce(r.ean,'')) like ?
                  or lower(coalesce(r.mpn,'')) like ?
                  or lower(coalesce(r.uid,'')) like ?
                )
            """);
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
            args.add(like);
        }

        if (!afterUid.isBlank()) {
            sql.append(" and r.uid > ? ");
            args.add(afterUid.trim());
        }

        sql.append(" order by r.uid asc limit ? ");
        args.add(limit);

        List<Map<String, Object>> items = jdbc.queryForList(sql.toString(), args.toArray());

        String nextAfterUid = "";
        if (!items.isEmpty() && items.size() == limit) {
            Object lastUid = items.get(items.size() - 1).get("uid");
            nextAfterUid = lastUid == null ? "" : String.valueOf(lastUid);
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("limit", limit);
        meta.put("afterUid", afterUid);
        meta.put("nextAfterUid", nextAfterUid);
        meta.put("q", query);

        return Map.of(
                "ok", true,
                "items", items,
                "nextAfterUid", nextAfterUid,
                "meta", meta
        );
    }

    @GetMapping("/api/db/scraped-product-view")
    public Map<String, Object> scrapedProductView(@RequestParam String uid) {
        return pricingSvc.scrapedProductViewByUid(uid);
    }
}