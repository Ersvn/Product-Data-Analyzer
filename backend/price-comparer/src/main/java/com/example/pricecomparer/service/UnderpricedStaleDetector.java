package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService.OverrideEntry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class UnderpricedStaleDetector {

    private final DataStoreService dataStore;

    @Value("${dashboard.queues.underpriced.marketMovePercent:0.01}")
    private double marketMovePercent;

    public UnderpricedStaleDetector(DataStoreService dataStore) {
        this.dataStore = dataStore;
    }

    public boolean isUnderpricedStale(Product p) {
        if (p == null) return false;
        if (p.id <= 0) return false;

        Double marketNow = dataStore.getMarketBenchmarkPrice(p);
        Double ourNow = dataStore.getOurComparablePrice(p);

        if (marketNow == null || marketNow <= 0) return false;

        OverrideEntry ov = dataStore.getOverrideById(p.id);
        if (ov == null && p.ean != null && !p.ean.isBlank()) {
            ov = dataStore.getOverrideByEan(p.ean);
        }

        if (ov == null || ov.lastSeenMarketBenchmark == null || ov.lastSeenMarketBenchmark <= 0) return false;

        double marketThen = ov.lastSeenMarketBenchmark;
        if (marketNow <= marketThen) return false;

        double movePct = (marketNow - marketThen) / marketThen;
        if (movePct < marketMovePercent) return false;

        Double ourThen = ov.lastSeenOurComparablePrice;
        if (ourThen != null && ourNow != null) {
            if (!approxEq(ourNow, ourThen, 0.5)) return false;
        } else {
            if (ov.lastSeenAt != null && !ov.lastSeenAt.isBlank()
                    && p.lastUpdated != null && !p.lastUpdated.isBlank()) {
                try {
                    Instant seen = Instant.parse(ov.lastSeenAt);
                    Instant updated = Instant.parse(p.lastUpdated);
                    if (updated.isAfter(seen)) return false;
                } catch (Exception ignored) {}
            }
        }

        return true;
    }

    public List<Product> buildUnderpricedQueue(int limit) {
        List<Product> out = new ArrayList<>();

        List<?> company = dataStore.company();
        for (Object o : company) {
            if (!(o instanceof Product p)) continue;
            if (isUnderpricedStale(p)) out.add(p);
        }

        out.sort(Comparator.comparingDouble(this::marketMovePct).reversed());

        if (limit > 0 && out.size() > limit) return out.subList(0, limit);
        return out;
    }

    private double marketMovePct(Product p) {
        if (p == null || p.id <= 0) return 0.0;

        Double marketNow = dataStore.getMarketBenchmarkPrice(p);

        OverrideEntry ov = dataStore.getOverrideById(p.id);
        if (ov == null && p.ean != null && !p.ean.isBlank()) ov = dataStore.getOverrideByEan(p.ean);

        if (marketNow == null || marketNow <= 0) return 0.0;
        if (ov == null || ov.lastSeenMarketBenchmark == null || ov.lastSeenMarketBenchmark <= 0) return 0.0;

        double then = ov.lastSeenMarketBenchmark;
        return (marketNow - then) / then;
    }

    private boolean approxEq(double a, double b, double tol) {
        return Math.abs(a - b) <= tol;
    }
}