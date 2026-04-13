package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.db.DbPricingService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class WorkQueueService {

    public enum QueueType {
        OVERPRICED, UNDERPRICED, OUTLIERS
    }

    private static final double ACTION_THRESHOLD_PCT = 0.02;   // 2%
    private static final double OUTLIER_ABS_GAP_PCT = 0.50;    // 50%

    private final JdbcTemplate jdbc;
    private final DbPricingService pricingService;

    public WorkQueueService(JdbcTemplate jdbc, DbPricingService pricingService) {
        this.jdbc = jdbc;
        this.pricingService = pricingService;
    }

    public Map<String, Object> queue(QueueType type, int limit) {
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        List<Map<String, Object>> rows = loadBaseRows();
        List<Map<String, Object>> items = new ArrayList<>();

        for (Map<String, Object> row : rows) {
            QueueEvaluation eval = evaluate(row);

            if (!matches(type, eval)) continue;

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
            item.put("gapKr", round2(eval.gapKr));
            item.put("gapPct", round4(eval.gapPct));

            item.put("priceMode", row.get("price_mode"));
            item.put("manualPrice", row.get("manual_price"));
            item.put("costPrice", row.get("cost_price"));
            item.put("ourPriceField", row.get("our_price"));
            item.put("marketPriceMin", row.get("price_min"));
            item.put("marketPriceMax", row.get("price_max"));
            item.put("competitorCount", row.get("offers_count"));

            items.add(item);
        }

        items.sort((a, b) -> {
            double aGap = num(a.get("gapPct"));
            double bGap = num(b.get("gapPct"));

            return switch (type) {
                case UNDERPRICED -> Double.compare(aGap, bGap); // mest negativ först
                case OVERPRICED -> Double.compare(bGap, aGap);  // mest positiv först
                case OUTLIERS -> Double.compare(Math.abs(bGap), Math.abs(aGap));
            };
        });

        if (items.size() > limit) {
            items = new ArrayList<>(items.subList(0, limit));
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("type", type.name());
        res.put("limit", limit);
        res.put("count", items.size());

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
        res.put("meta", meta);

        res.put("items", items);
        return res;
    }

    public Map<String, Long> summarizeActionCounts() {
        List<Map<String, Object>> rows = loadBaseRows();

        long overpriced = 0L;
        long underpriced = 0L;
        long outliers = 0L;

        for (Map<String, Object> row : rows) {
            QueueEvaluation eval = evaluate(row);

            if (matches(QueueType.OVERPRICED, eval)) overpriced++;
            if (matches(QueueType.UNDERPRICED, eval)) underpriced++;
            if (matches(QueueType.OUTLIERS, eval)) outliers++;
        }

        Map<String, Long> out = new LinkedHashMap<>();
        out.put("OVERPRICED", overpriced);
        out.put("UNDERPRICED", underpriced);
        out.put("OUTLIERS", outliers);
        return out;
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
                upper(c.price_mode) as price_mode,
                c.manual_price,
                c.our_price,
                c.cost_price,
                r.offers_count,
                r.price_min,
                r.price_max,
                r.price_median,
                case
                  when upper(c.price_mode) = 'MANUAL'
                       and coalesce(c.manual_price, 0) > 0
                    then c.manual_price
                  else coalesce(c.our_price, 0)
                end as our_price_eff,
                case
                  when coalesce(r.price_median, 0) > 0 then r.price_median
                  when coalesce(r.price_min, 0) > 0 and coalesce(r.price_max, 0) > 0
                    then round(((r.price_min + r.price_max) / 2.0)::numeric, 2)
                  when coalesce(r.price_min, 0) > 0 then r.price_min
                  when coalesce(r.price_max, 0) > 0 then r.price_max
                  else null
                end as market_price
              from company_listings c
              join scraped_market_rollup r
                on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
                or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
            )
            select *
            from base
            where market_price is not null
              and market_price > 0
              and our_price_eff > 0
        """);
    }

    private QueueEvaluation evaluate(Map<String, Object> row) {
        BigDecimal ourPrice = bd(row.get("our_price_eff"));
        BigDecimal marketPrice = bd(row.get("market_price"));

        BigDecimal recommendedPrice = pricingService.computeRecommendedFromInputs(
                str(row.get("company_sku")),
                bd(row.get("cost_price")),
                ourPrice,
                marketPrice,
                bd(row.get("price_min")),
                bd(row.get("price_max")),
                intVal(row.get("offers_count"))
        );

        double gapKr;
        double gapPct;

        if (marketPrice != null
                && marketPrice.signum() > 0
                && recommendedPrice != null
                && recommendedPrice.signum() > 0) {
            // för under/over använder vi recommended
            gapKr = diff(ourPrice, recommendedPrice);
            gapPct = pct(ourPrice, recommendedPrice);
        } else if (marketPrice != null && marketPrice.signum() > 0) {
            // fallback så vi alltid har något vettigt för outliers
            gapKr = diff(ourPrice, marketPrice);
            gapPct = pct(ourPrice, marketPrice);
        } else {
            gapKr = 0.0;
            gapPct = 0.0;
        }

        double outlierGapKr = diff(ourPrice, marketPrice);
        double outlierGapPct = pct(ourPrice, marketPrice);

        return new QueueEvaluation(
                ourPrice,
                marketPrice,
                recommendedPrice,
                gapKr,
                gapPct,
                outlierGapKr,
                outlierGapPct
        );
    }

    private boolean matches(QueueType type, QueueEvaluation eval) {
        return switch (type) {
            case UNDERPRICED ->
                    eval.recommendedPrice != null
                            && eval.recommendedPrice.signum() > 0
                            && eval.gapPct <= -ACTION_THRESHOLD_PCT;

            case OVERPRICED ->
                    eval.recommendedPrice != null
                            && eval.recommendedPrice.signum() > 0
                            && eval.gapPct >= ACTION_THRESHOLD_PCT;

            case OUTLIERS ->
                    eval.marketPrice != null
                            && eval.marketPrice.signum() > 0
                            && Math.abs(eval.outlierGapPct) >= OUTLIER_ABS_GAP_PCT;
        };
    }

    private record QueueEvaluation(
            BigDecimal ourPrice,
            BigDecimal marketPrice,
            BigDecimal recommendedPrice,
            double gapKr,
            double gapPct,
            double outlierGapKr,
            double outlierGapPct
    ) {}

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intVal(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    private static BigDecimal bd(Object o) {
        if (o == null) return null;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    private static double num(Object o) {
        if (o == null) return 0.0;
        if (o instanceof BigDecimal b) return b.doubleValue();
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (Exception e) {
            return 0.0;
        }
    }

    private static double diff(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) return 0.0;
        return a.subtract(b).doubleValue();
    }

    private static double pct(BigDecimal current, BigDecimal target) {
        if (current == null || target == null || target.signum() <= 0) return 0.0;
        return current.subtract(target)
                .divide(target, 8, RoundingMode.HALF_UP)
                .doubleValue();
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}