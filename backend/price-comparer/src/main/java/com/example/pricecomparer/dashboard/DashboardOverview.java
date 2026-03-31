package com.example.pricecomparer.dashboard;

import java.time.Instant;
import java.util.Map;

public record DashboardOverview(
        boolean ok,
        long totalProducts,
        long matchedProducts,
        double matchRatePct,
        long cheaperCount,
        long similarCount,
        long moreExpensiveCount,
        double cheaperPct,
        double similarPct,
        double moreExpensivePct,
        double avgMarketPrice,
        double avgOurPrice,
        double avgGapKr,
        double avgGapPct,
        double priceIndex,
        Instant dataFreshness,
        long companyMissingEanCount,
        long companyMissingEffectivePriceCount,
        long marketMissingPriceSignalCount,
        Map<String, Object> meta
) {}