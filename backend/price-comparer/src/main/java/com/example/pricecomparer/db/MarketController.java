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

    @GetMapping("/api/db/scraped-market")
    public Map<String, Object> listScrapedMarket(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "") String afterUid,
            @RequestParam(required = false) String q
    ) {
        int clampedLimit = DbRequestParsers.clamp(limit, 1, 500);
        String query = DbRequestParsers.normalizeSearchLower(q);
        String like = "%" + query + "%";

        StringBuilder sql = new StringBuilder(baseSql());
        List<Object> args = new ArrayList<>();

        if (!query.isBlank()) {
            sql.append("""
                and (
                  lower(coalesce(r.display_name,'')) like ?
                  or lower(coalesce(r.brand,'')) like ?
                  or lower(coalesce(r.ean,'')) like ?
                  or lower(coalesce(r.mpn,'')) like ?
                  or lower(coalesce(r.uid,'')) like ?
                )
                """);
            for (int i = 0; i < 5; i++) args.add(like);
        }
        if (!afterUid.isBlank()) {
            sql.append(" and r.uid > ? ");
            args.add(afterUid.trim());
        }

        sql.append(" order by r.uid asc limit ? ");
        args.add(clampedLimit);

        List<Map<String, Object>> items = jdbc.queryForList(sql.toString(), args.toArray());
        String nextAfterUid = items.isEmpty() || items.size() < clampedLimit ? "" : String.valueOf(items.getLast().get("uid"));

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("limit", clampedLimit);
        meta.put("afterUid", afterUid);
        meta.put("nextAfterUid", nextAfterUid);
        meta.put("q", query);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("items", items);
        out.put("nextAfterUid", nextAfterUid);
        out.put("meta", meta);
        return out;
    }

    @GetMapping("/api/db/scraped-product-view")
    public Map<String, Object> scrapedProductView(@RequestParam String uid) {
        return pricingSvc.scrapedProductViewByUid(uid);
    }

    private String baseSql() {
        return """
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
                where %s
              ) as inventory_matched,
              (
                select count(*)
                from company_listings c
                where %s
              ) as inventory_match_count
            from scraped_market_rollup r
            where 1=1
            """.formatted(
                DbSql.COMPANY_EAN_UID + " = r.uid or " + DbSql.COMPANY_MPN_UID + " = r.uid",
                DbSql.COMPANY_EAN_UID + " = r.uid or " + DbSql.COMPANY_MPN_UID + " = r.uid"
        );
    }
}
