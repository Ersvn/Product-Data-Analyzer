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

    /** UNDERPRICED = market benchmark went up since lastSeen AND our price hasn't changed */
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

        // Our price must be unchanged since last seen (tolerance)
        Double ourThen = ov.lastSeenOurComparablePrice;
        if (ourThen != null && ourNow != null) {
            if (!approxEq(ourNow, ourThen, 0.5)) return false;
        } else {
            // fallback: if our product updated after lastSeenAt -> user already acted
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

    /**
     * Builds an UNDERPRICED queue using ONLY stale-market-move logic.
     * This version is "raw-safe": it tolerates raw Lists where elements are Objects.
     */
    public List<Product> buildUnderpricedQueue(int limit) {
        List<Product> out = new ArrayList<>();

        // IMPORTANT: iterate raw-safe to avoid Object typing issues
        List<?> company = dataStore.company(); // could be raw internally
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