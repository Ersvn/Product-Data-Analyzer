package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class WorkQueueService {

    public enum QueueType {
        OVERPRICED, UNDERPRICED, OUTLIERS
    }

    private final DataStoreService store;

    // Same tolerance as DashboardService (±0.5%)
    private static final double SIMILAR_TOL_PCT = 0.005;

    // ✅ UPDATED: 25% instead of 50% so OUTLIERS becomes useful
    private static final double OUTLIER_ABS_GAP_PCT = 0.25;

    public WorkQueueService(DataStoreService store) {
        this.store = store;
    }

    public Map<String, Object> queue(QueueType type, int limit) {
        if (limit < 1) limit = 1;
        if (limit > 200) limit = 200;

        List<Product> company = store.getCompanyProducts();

        List<Row> rows = new ArrayList<>();

        for (Product p : company) {
            if (p == null || p.ean == null || p.ean.isBlank()) continue;

            Double bench = store.getMarketBenchmarkPrice(p);
            if (bench == null || bench <= 0) continue;

            Double our = store.getOurComparablePrice(p);
            if (our == null || our <= 0) continue;

            double gapKr = our - bench;
            double gapPct = (bench == 0) ? 0 : (gapKr / bench);

            // IMPORTANT: same tolerance logic as overview
            double tolKr = SIMILAR_TOL_PCT * bench;

            Row r = new Row(p, bench, our, gapKr, gapPct);

            switch (type) {
                case OVERPRICED -> {
                    if (gapKr > tolKr) rows.add(r);
                }
                case UNDERPRICED -> {
                    if (gapKr < -tolKr) rows.add(r);
                }
                case OUTLIERS -> {
                    if (Math.abs(gapPct) >= OUTLIER_ABS_GAP_PCT) rows.add(r);
                }
            }
        }

        Comparator<Row> byAbsGap = Comparator.comparingDouble((Row r) -> Math.abs(r.gapKr)).reversed();
        Comparator<Row> byGapDesc = Comparator.comparingDouble((Row r) -> r.gapKr).reversed();
        Comparator<Row> byGapAsc = Comparator.comparingDouble((Row r) -> r.gapKr);

        List<Row> sorted = switch (type) {
            case OVERPRICED -> rows.stream().sorted(byGapDesc).limit(limit).toList();
            case UNDERPRICED -> rows.stream().sorted(byGapAsc).limit(limit).toList();
            case OUTLIERS -> rows.stream().sorted(byAbsGap).limit(limit).toList();
        };

        List<Map<String, Object>> items = sorted.stream()
                .map(this::toItem)
                .collect(Collectors.toList());

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("type", type.name());
        res.put("limit", limit);
        res.put("count", items.size());

        Map<String, Object> meta = new LinkedHashMap<>();
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

    private Map<String, Object> toItem(Row r) {
        Product p = r.p;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.id);
        m.put("ean", p.ean);
        m.put("name", p.name);
        m.put("brand", p.brand);
        m.put("category", p.category);

        m.put("ourPrice", round2(r.our));
        m.put("marketPrice", round2(r.bench));

        m.put("gapKr", round2(r.gapKr));
        m.put("gapPct", round4(r.gapPct));

        m.put("priceMode", p.priceMode == null ? null : p.priceMode.name());
        m.put("manualPrice", p.manualPrice);
        m.put("recommendedPrice", p.recommendedPrice);
        m.put("ourPriceField", p.ourPrice);
        m.put("priceField", p.price);

        return m;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private static final class Row {
        final Product p;
        final double bench;
        final double our;
        final double gapKr;
        final double gapPct;

        Row(Product p, double bench, double our, double gapKr, double gapPct) {
            this.p = p;
            this.bench = bench;
            this.our = our;
            this.gapKr = gapKr;
            this.gapPct = gapPct;
        }
    }
}
