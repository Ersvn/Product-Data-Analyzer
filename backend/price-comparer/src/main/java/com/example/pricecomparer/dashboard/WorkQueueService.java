package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.service.DataStoreService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class WorkQueueService {

    public enum QueueType {
        OVERPRICED, UNDERPRICED, OUTLIERS
    }

    private final DataStoreService store; // keep for legacy mode
    private final JdbcTemplate jdbc;

    @Value("${app.storage:FILES}")
    private String storage;

    // Same tolerance as DashboardService (±0.5%)
    private static final double SIMILAR_TOL_PCT = 0.005;

    // 25% outliers (same as your current WorkQueueService)
    private static final double OUTLIER_ABS_GAP_PCT = 0.25;

    public WorkQueueService(DataStoreService store, JdbcTemplate jdbc) {
        this.store = store;
        this.jdbc = jdbc;
    }

    public Map<String, Object> queue(QueueType type, int limit) {
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        if ("DB".equalsIgnoreCase(String.valueOf(storage).trim())) {
            return queueFromDb(type, limit);
        }

        return queueLegacy(type, limit);
    }

    /* =========================================================
       DB queue
       ========================================================= */

    private Map<String, Object> queueFromDb(QueueType type, int limit) {

        String filter;
        switch (type) {
            case OVERPRICED -> filter = "gap_kr > tol_kr";
            case UNDERPRICED -> filter = "gap_kr < -tol_kr";
            case OUTLIERS -> filter = "abs(gap_pct) >= ?";
            default -> filter = "abs(gap_pct) >= ?";
        }

        String order;
        switch (type) {
            case OVERPRICED -> order = "gap_kr desc";
            case UNDERPRICED -> order = "gap_kr asc";
            case OUTLIERS -> order = "abs(gap_kr) desc";
            default -> order = "abs(gap_kr) desc";
        }

        String sql = """
            with base as (
              select
                c.id,
                c.ean,
                c.name,
                c.brand,
                c.category,
                upper(coalesce(c.price_mode,'AUTO')) as price_mode,
                c.manual_price,
                c.our_price,
                s.benchmark_price as market_price,
                (case
                   when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0 then c.manual_price
                   else c.our_price
                 end) as our_price_eff
              from company_listings c
              join product_market_snapshot s on s.product_id = c.matched_product_id
              where c.matched_product_id is not null
                and c.ean is not null and btrim(c.ean) <> ''
                and s.benchmark_price is not null and s.benchmark_price > 0
                and (case
                      when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0 then c.manual_price
                      else c.our_price
                    end) is not null
                and (case
                      when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0 then c.manual_price
                      else c.our_price
                    end) > 0
            ),
            calc as (
              select
                id, ean, name, brand, category,
                price_mode, manual_price, our_price,
                market_price,
                our_price_eff,
                (our_price_eff - market_price) as gap_kr,
                (our_price_eff - market_price) / market_price as gap_pct,
                (market_price * ?) as tol_kr
              from base
            )
            select *
            from calc
            where
        """ + " " + filter + " order by " + order + " limit " + limit;

        List<Map<String, Object>> rows;
        if (type == QueueType.OUTLIERS) {
            rows = jdbc.queryForList(sql, SIMILAR_TOL_PCT, OUTLIER_ABS_GAP_PCT);
        } else {
            rows = jdbc.queryForList(sql, SIMILAR_TOL_PCT);
        }

        List<Map<String, Object>> items = rows.stream()
                .map(this::toItemFromDbRow)
                .collect(Collectors.toList());

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("type", type.name());
        res.put("limit", limit);
        res.put("count", items.size());

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("storage", "DB");
        meta.put("similarTolerancePct", 0.5);
        meta.put("outlierAbsGapPct", OUTLIER_ABS_GAP_PCT * 100.0);
        meta.put("rules", switch (type) {
            case OVERPRICED -> "gapKr > (0.5% of benchmark)";
            case UNDERPRICED -> "gapKr < -(0.5% of benchmark)";
            case OUTLIERS -> "abs(gapPct) >= 25%";
        });
        res.put("meta", meta);

        res.put("items", items);
        return res;
    }

    private Map<String, Object> toItemFromDbRow(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.get("id"));
        m.put("ean", r.get("ean"));
        m.put("name", r.get("name"));
        m.put("brand", r.get("brand"));
        m.put("category", r.get("category"));

        double our = num(r.get("our_price_eff"));
        double market = num(r.get("market_price"));
        double gapKr = num(r.get("gap_kr"));
        double gapPct = num(r.get("gap_pct"));

        m.put("ourPrice", round2(our));
        m.put("marketPrice", round2(market));

        m.put("gapKr", round2(gapKr));
        m.put("gapPct", round4(gapPct));

        m.put("priceMode", r.get("price_mode"));
        m.put("manualPrice", r.get("manual_price"));
        m.put("recommendedPrice", null); // not in DB schema right now
        m.put("ourPriceField", r.get("our_price"));
        m.put("priceField", null);

        return m;
    }

    /* =========================================================
       Legacy placeholder
       ========================================================= */

    private Map<String, Object> queueLegacy(QueueType type, int limit) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("type", type.name());
        res.put("limit", limit);
        res.put("count", 0);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("storage", "FILES");
        meta.put("notes", "FILES-mode: queue använder DataStoreService.");
        res.put("meta", meta);

        res.put("items", List.of());
        return res;
    }

    private static double num(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}