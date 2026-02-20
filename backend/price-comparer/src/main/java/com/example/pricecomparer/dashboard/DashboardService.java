package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {

    private final DataStoreService store;

    @Value("${app.data.marketPath:}")
    private String marketPath;

    @Value("${app.data.companyPath:}")
    private String companyPath;

    @Value("${app.data.useEnrichedMarket:false}")
    private boolean useEnrichedMarket;

    // Same tolerance as you already use for "similar": ±0.5%
    private static final double SIMILAR_TOL_PCT = 0.005;

    // "Outlier" threshold (enterprise-ish default). Adjust whenever you want.
    private static final double OUTLIER_ABS_GAP_PCT = 0.50; // 50%

    public DashboardService(DataStoreService store) {
        this.store = store;
    }

    public DashboardOverview overview(int days) {
        // “Current snapshot overview” (production-style).
        // days används senare för trend/historik.

        List<Product> company = safeList(store.getCompanyProducts());
        List<Product> market = safeList(store.getMarketProducts());

        long totalProducts = company.size();

        long companyMissingEan = 0;
        long companyMissingComparablePrice = 0;
        long marketMissingPriceSignal = 0;

        long matchedMarket = 0;
        long matchedPriced = 0;

        long cheaper = 0;
        long similar = 0;
        long moreExpensive = 0;

        long overPriced = 0;
        long underPriced = 0;
        long outliers = 0;

        double sumMarket = 0;
        double sumOur = 0;

        Instant freshness = null;

        // Benchmark quality signals
        long benchFromMinMaxOrOffers = 0; // "good" signal
        long benchFallbackPriceOnly = 0;  // fallback = market.price
        long benchHasOffersCount = 0;

        for (Product p : company) {
            if (p == null) continue;

            if (p.ean == null || p.ean.isBlank()) {
                companyMissingEan++;
                continue;
            }

            // 1) Must exist in market by EAN to be "matched"
            Product marketP = store.getMarketProductByEan(p.ean);
            if (marketP == null) {
                continue;
            }
            matchedMarket++;

            // 2) Market benchmark must exist to be comparable
            Double marketPrice = store.getMarketBenchmarkPrice(p);
            if (marketPrice == null || marketPrice <= 0) {
                marketMissingPriceSignal++;
                continue;
            }

            // Track benchmark quality based on available signals in market product
            boolean hasMin = marketP.priceMin != null && marketP.priceMin > 0;
            boolean hasMax = marketP.priceMax != null && marketP.priceMax > 0;
            boolean hasOffers = marketP.offersCount != null && marketP.offersCount > 0;

            if (hasOffers) benchHasOffersCount++;

            // If benchmark could have been derived from min/max, that's higher quality than fallback price.
            // If neither min nor max exists, dashboard essentially relies on market.price fallback.
            if (hasMin || hasMax || hasOffers) benchFromMinMaxOrOffers++;
            else benchFallbackPriceOnly++;

            // 3) Our comparable price must exist
            Double ourComparable = store.getOurComparablePrice(p);
            if (ourComparable == null || ourComparable <= 0) {
                companyMissingComparablePrice++;
                continue;
            }

            matchedPriced++;

            double our = ourComparable;
            double mkt = marketPrice;

            sumMarket += mkt;
            sumOur += our;

            double gap = our - mkt;

            // “similar” tolerance ±0.5%
            double tol = SIMILAR_TOL_PCT * mkt;

            if (gap < -tol) cheaper++;
            else if (gap > tol) moreExpensive++;
            else similar++;

            if (gap > tol) overPriced++;
            else if (gap < -tol) underPriced++;

            double gapPct = (mkt == 0) ? 0 : (gap / mkt);
            if (Math.abs(gapPct) >= OUTLIER_ABS_GAP_PCT) outliers++;

            // Freshness = max(lastUpdated) across company products
            Instant lu = safeInstant(p.lastUpdated);
            if (lu != null && (freshness == null || lu.isAfter(freshness))) {
                freshness = lu;
            }
        }

        double avgMarket = matchedPriced == 0 ? 0 : (sumMarket / matchedPriced);
        double avgOur = matchedPriced == 0 ? 0 : (sumOur / matchedPriced);

        double avgGapKr = matchedPriced == 0 ? 0 : (avgOur - avgMarket);
        double avgGapPct = avgMarket == 0 ? 0 : ((avgOur - avgMarket) / avgMarket);

        double priceIndex = avgMarket == 0 ? 0 : (avgOur / avgMarket) * 100.0;

        double cheaperPct = matchedPriced == 0 ? 0 : (cheaper * 100.0 / matchedPriced);
        double similarPct = matchedPriced == 0 ? 0 : (similar * 100.0 / matchedPriced);
        double moreExpPct = matchedPriced == 0 ? 0 : (moreExpensive * 100.0 / matchedPriced);

        double matchRatePct = totalProducts == 0 ? 0 : (matchedPriced * 100.0 / totalProducts);

        // Coverage / quality (enterprise)
        double matchedMarketRate = totalProducts == 0 ? 0 : (matchedMarket * 100.0 / totalProducts);
        double pricedRate = totalProducts == 0 ? 0 : (matchedPriced * 100.0 / totalProducts);

        double qualityRate = matchedMarket == 0 ? 0 : (benchFromMinMaxOrOffers * 100.0 / matchedMarket);

        String benchmarkQuality =
                qualityRate >= 60 ? "HIGH" :
                        qualityRate >= 15 ? "MED" :
                                "LOW";

        Map<String, Object> actionCounts = new LinkedHashMap<>();
        actionCounts.put("OVERPRICED", overPriced);
        actionCounts.put("UNDERPRICED", underPriced);
        actionCounts.put("OUTLIERS", outliers);
        actionCounts.put("CHEAPER", cheaper);
        actionCounts.put("SIMILAR", similar);
        actionCounts.put("MORE_EXPENSIVE", moreExpensive);

        actionCounts.put("MISSING_EAN", companyMissingEan);
        actionCounts.put("MISSING_COMPARABLE", companyMissingComparablePrice);
        actionCounts.put("MISSING_BENCHMARK", marketMissingPriceSignal);

        actionCounts.put("MATCHED_MARKET", matchedMarket);
        actionCounts.put("MATCHED_PRICED", matchedPriced);

        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalProducts", totalProducts);
        coverage.put("matchedMarket", matchedMarket);
        coverage.put("matchedPriced", matchedPriced);
        coverage.put("matchedMarketRatePct", round2(matchedMarketRate));
        coverage.put("pricedCoverageRatePct", round2(pricedRate));

        Map<String, Object> quality = new LinkedHashMap<>();
        quality.put("benchmarkQuality", benchmarkQuality);
        quality.put("benchmarkQualityRatePct", round2(qualityRate));
        quality.put("benchFromMinMaxOrOffers", benchFromMinMaxOrOffers);
        quality.put("benchFallbackPriceOnly", benchFallbackPriceOnly);
        quality.put("benchHasOffersCount", benchHasOffersCount);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("days", days);
        meta.put("marketPath", marketPath);
        meta.put("companyPath", companyPath);
        meta.put("useEnrichedMarket", useEnrichedMarket);
        meta.put("companyCount", company.size());
        meta.put("marketCount", market.size());

        meta.put("similarTolerancePct", 0.5);
        meta.put("outlierAbsGapPct", OUTLIER_ABS_GAP_PCT * 100.0);

        // Explicit definitions (detta matchar det du vill visa i dashboarden)
        meta.put("benchmarkDefinition",
                "market.priceMin/priceMax median if both exist; else priceMin; else priceMax; else price");
        meta.put("ourComparablePriceDefinition",
                "MANUAL->manualPrice; else recommendedPrice; else ourPrice; else price");
        meta.put("gapDefinition",
                "gapKr = ourComparablePrice - marketBenchmarkPrice");
        meta.put("priceIndexDefinition",
                "priceIndex = (avgOurPrice/avgMarketPrice)*100");

        // Keep old fields you already used
        meta.put("matchedMarket", matchedMarket);
        meta.put("matchedPriced", matchedPriced);

        // NEW: enterprise intelligence layer (without breaking DashboardOverview)
        meta.put("actionCounts", actionCounts);
        meta.put("coverage", coverage);
        meta.put("quality", quality);

        // A very small "health" object (frontend can show this as chips)
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("computedAt", Instant.now().toString());
        health.put("dataFreshness", freshness == null ? null : freshness.toString());
        health.put("ok", true);
        health.put("notes", switch (benchmarkQuality) {
            case "HIGH" -> "Benchmark quality HIGH: min/max/offers används ofta.";
            case "MED" -> "Benchmark quality MED: blandat min/max/offers och fallback price.";
            default -> "Benchmark quality LOW: benchmark bygger mest på market.price fallback.";
        });
        meta.put("health", health);

        return new DashboardOverview(
                true,
                totalProducts,
                matchedPriced,
                round2(matchRatePct),

                cheaper,
                similar,
                moreExpensive,
                round2(cheaperPct),
                round2(similarPct),
                round2(moreExpPct),

                round2(avgMarket),
                round2(avgOur),
                round2(avgGapKr),
                round4(avgGapPct),
                round2(priceIndex),

                freshness,

                companyMissingEan,
                companyMissingComparablePrice,
                marketMissingPriceSignal,

                meta
        );
    }

    private List<Product> safeList(List<Product> list) {
        return list == null ? List.of() : list;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private Instant safeInstant(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return Instant.parse(iso.trim());
        } catch (Exception ignored) {
            return null;
        }
    }
}
