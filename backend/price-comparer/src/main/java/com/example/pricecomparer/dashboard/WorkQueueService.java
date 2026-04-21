package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.db.DbPricingService;
import com.example.pricecomparer.db.DbSql;
import com.example.pricecomparer.db.DbValueUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class WorkQueueService {

    public enum QueueType {
        OVERPRICED,
        UNDERPRICED,
        OUTLIERS;

        public static QueueType parse(String raw) {
            if (raw == null || raw.isBlank()) return OUTLIERS;
            try {
                return valueOf(raw.trim().toUpperCase());
            } catch (IllegalArgumentException ex) {
                return OUTLIERS;
            }
        }
    }

    private static final double ACTION_THRESHOLD_PCT = 0.02;
    private static final double OUTLIER_ABS_GAP_PCT = 0.50;

    private final JdbcTemplate jdbc;
    private final DbPricingService pricingService;

    public WorkQueueService(JdbcTemplate jdbc, DbPricingService pricingService) {
        this.jdbc = jdbc;
        this.pricingService = pricingService;
    }

    public Map<String, Object> queue(QueueType type, int limit) {
        int clampedLimit = Math.max(1, Math.min(limit, 200));
        List<Map<String, Object>> items = buildItems(type);
        items.sort(comparatorFor(type));
        if (items.size() > clampedLimit) items = new ArrayList<>(items.subList(0, clampedLimit));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("type", type.name());
        out.put("limit", clampedLimit);
        out.put("count", items.size());
        out.put("meta", queueMeta(type));
        out.put("items", items);
        return out;
    }

    public Map<String, Long> summarizeActionCounts() {
        Map<String, Long> out = new LinkedHashMap<>();
        for (QueueType type : QueueType.values()) {
            out.put(type.name(), (long) buildItems(type).size());
        }
        return out;
    }

    private List<Map<String, Object>> buildItems(QueueType type) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> row : loadBaseRows()) {
            QueueEvaluation eval = evaluate(row);
            if (!matches(type, eval)) continue;
            items.add(buildItem(row, eval));
        }
        return items;
    }

    private List<Map<String, Object>> loadBaseRows() {
        return jdbc.queryForList("""
            with base as (
              select
                c.id,
                c.company_sku,
                c.ean,
                c.mpn,
                c.name,
                c.brand,
                c.category,
                upper(coalesce(c.price_mode, 'AUTO')) as price_mode,
                c.manual_price,
                c.our_price,
                c.cost_price,
                r.offers_count,
                r.price_min,
                r.price_max,
                r.price_median,
                %s as our_price_eff,
                %s as market_price
              from company_listings c
              join scraped_market_rollup r
                on %s
            )
            select *
            from base
            where market_price is not null
              and market_price > 0
              and our_price_eff > 0
            """.formatted(DbSql.EFFECTIVE_PRICE_SQL, DbSql.BENCHMARK_PRICE_SQL, DbSql.COMPANY_TO_MARKET_JOIN));
    }

    private QueueEvaluation evaluate(Map<String, Object> row) {
        BigDecimal ourPrice = DbValueUtils.dec(row.get("our_price_eff"));
        BigDecimal marketPrice = DbValueUtils.dec(row.get("market_price"));
        BigDecimal recommendedPrice = pricingService.computeRecommendedFromInputs(
                DbValueUtils.str(row.get("company_sku")),
                DbValueUtils.dec(row.get("cost_price")),
                ourPrice,
                marketPrice,
                DbValueUtils.dec(row.get("price_min")),
                DbValueUtils.dec(row.get("price_max")),
                DbValueUtils.intOrNull(row.get("offers_count"))
        );

        double actionGapKr = diff(ourPrice, recommendedPrice != null && recommendedPrice.signum() > 0 ? recommendedPrice : marketPrice);
        double actionGapPct = pct(ourPrice, recommendedPrice != null && recommendedPrice.signum() > 0 ? recommendedPrice : marketPrice);
        double outlierGapKr = diff(ourPrice, marketPrice);
        double outlierGapPct = pct(ourPrice, marketPrice);

        return new QueueEvaluation(ourPrice, marketPrice, recommendedPrice, actionGapKr, actionGapPct, outlierGapKr, outlierGapPct);
    }

    private boolean matches(QueueType type, QueueEvaluation eval) {
        return switch (type) {
            case UNDERPRICED -> eval.recommendedPrice != null && eval.recommendedPrice.signum() > 0 && eval.actionGapPct <= -ACTION_THRESHOLD_PCT;
            case OVERPRICED -> eval.recommendedPrice != null && eval.recommendedPrice.signum() > 0 && eval.actionGapPct >= ACTION_THRESHOLD_PCT;
            case OUTLIERS -> eval.marketPrice != null && eval.marketPrice.signum() > 0 && Math.abs(eval.outlierGapPct) >= OUTLIER_ABS_GAP_PCT;
        };
    }

    private Map<String, Object> buildItem(Map<String, Object> row, QueueEvaluation eval) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", row.get("id"));
        item.put("companySku", row.get("company_sku"));
        item.put("ean", row.get("ean"));
        item.put("mpn", row.get("mpn"));
        item.put("name", row.get("name"));
        item.put("brand", row.get("brand"));
        item.put("category", row.get("category"));
        item.put("ourPrice", round2(num(eval.ourPrice)));
        item.put("marketPrice", round2(num(eval.marketPrice)));
        item.put("recommendedPrice", round2(num(eval.recommendedPrice)));
        item.put("gapKr", round2(eval.actionGapKr));
        item.put("gapPct", round4(eval.actionGapPct));
        item.put("outlierGapKr", round2(eval.outlierGapKr));
        item.put("outlierGapPct", round4(eval.outlierGapPct));
        item.put("priceMode", row.get("price_mode"));
        item.put("manualPrice", row.get("manual_price"));
        item.put("costPrice", row.get("cost_price"));
        item.put("ourPriceField", row.get("our_price"));
        item.put("marketPriceMin", row.get("price_min"));
        item.put("marketPriceMax", row.get("price_max"));
        item.put("competitorCount", row.get("offers_count"));
        return item;
    }

    private Comparator<Map<String, Object>> comparatorFor(QueueType type) {
        return (a, b) -> switch (type) {
            case UNDERPRICED -> Double.compare(DbValueUtils.doubleOrZero(a.get("gapPct")), DbValueUtils.doubleOrZero(b.get("gapPct")));
            case OVERPRICED -> Double.compare(DbValueUtils.doubleOrZero(b.get("gapPct")), DbValueUtils.doubleOrZero(a.get("gapPct")));
            case OUTLIERS -> Double.compare(Math.abs(DbValueUtils.doubleOrZero(b.get("outlierGapPct"))), Math.abs(DbValueUtils.doubleOrZero(a.get("outlierGapPct"))));
        };
    }

    private Map<String, Object> queueMeta(QueueType type) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("storage", "DB");
        meta.put("marketSource", "SCRAPED");
        meta.put("actionThresholdPct", ACTION_THRESHOLD_PCT * 100.0);
        meta.put("outlierAbsGapPct", OUTLIER_ABS_GAP_PCT * 100.0);
        meta.put("rules", switch (type) {
            case OVERPRICED -> "ourPrice >= recommendedPrice by at least 2%";
            case UNDERPRICED -> "ourPrice <= recommendedPrice by at least 2%";
            case OUTLIERS -> "abs(ourPrice - marketPrice) / marketPrice >= 50%";
        });
        return meta;
    }

    private record QueueEvaluation(
            BigDecimal ourPrice,
            BigDecimal marketPrice,
            BigDecimal recommendedPrice,
            double actionGapKr,
            double actionGapPct,
            double outlierGapKr,
            double outlierGapPct
    ) {}

    private double num(BigDecimal value) {
        return value == null ? 0.0 : value.doubleValue();
    }

    private double diff(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) return 0.0;
        return a.subtract(b).doubleValue();
    }

    private double pct(BigDecimal current, BigDecimal target) {
        if (current == null || target == null || target.signum() <= 0) return 0.0;
        return current.subtract(target).divide(target, 8, RoundingMode.HALF_UP).doubleValue();
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
