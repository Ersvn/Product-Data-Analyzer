package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.service.DataStoreService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class DashboardService {

    private final DataStoreService store;
    private final JdbcTemplate jdbc;

    @Value("${app.storage:FILES}")
    private String storage;

    @Value("${app.data.marketPath:}")
    private String marketPath;

    @Value("${app.data.companyPath:}")
    private String companyPath;

    @Value("${app.data.useEnrichedMarket:false}")
    private boolean useEnrichedMarket;

    private static final double SIMILAR_TOL_PCT = 0.005;
    private static final double OUTLIER_ABS_GAP_PCT = 0.50; // 50%

    public DashboardService(DataStoreService store, JdbcTemplate jdbc) {
        this.store = store;
        this.jdbc = jdbc;
    }

    public DashboardOverview overview(int days) {
        if ("DB".equalsIgnoreCase(String.valueOf(storage).trim())) {
            return overviewFromDb(days);
        }
        return legacyOverview(days);
    }

    private DashboardOverview overviewFromDb(int days) {

        long totalProducts = qLong("select count(*) from company_listings");

        long companyMissingEan = qLong("""
            select count(*)
            from company_listings
            where ean is null or btrim(ean) = ''
        """);

        long matchedMarket = qLong("""
            select count(*)
            from company_listings
            where matched_product_id is not null
              and ean is not null and btrim(ean) <> ''
        """);

        long marketMissingPriceSignal = qLong("""
            select count(*)
            from company_listings c
            left join product_market_snapshot s on s.product_id = c.matched_product_id
            where c.matched_product_id is not null
              and c.ean is not null and btrim(c.ean) <> ''
              and (s.benchmark_price is null or s.benchmark_price <= 0)
        """);

        long companyMissingComparable = qLong("""
            select count(*)
            from company_listings c
            where c.ean is not null and btrim(c.ean) <> ''
              and c.matched_product_id is not null
              and (
                (upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) <= 0)
                and (coalesce(c.our_price,0) <= 0)
                or (upper(coalesce(c.price_mode,'AUTO')) <> 'MANUAL' and coalesce(c.our_price,0) <= 0)
              )
        """);

        long matchedPriced = qLong("""
            select count(*)
            from company_listings c
            join product_market_snapshot s on s.product_id = c.matched_product_id
            where c.matched_product_id is not null
              and c.ean is not null and btrim(c.ean) <> ''
              and s.benchmark_price is not null and s.benchmark_price > 0
              and (
                  case
                    when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0
                      then c.manual_price
                    else coalesce(c.our_price,0)
                  end
              ) > 0
        """);

        Map<String, Object> agg = jdbc.queryForMap("""
            with base as (
              select
                c.last_updated as last_updated,
                s.benchmark_price as bench,
                (case
                   when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0 then c.manual_price
                   else coalesce(c.our_price,0)
                 end) as our
              from company_listings c
              join product_market_snapshot s on s.product_id = c.matched_product_id
              where c.matched_product_id is not null
                and c.ean is not null and btrim(c.ean) <> ''
                and s.benchmark_price is not null and s.benchmark_price > 0
                and (case
                      when upper(coalesce(c.price_mode,'AUTO')) = 'MANUAL' and coalesce(c.manual_price,0) > 0 then c.manual_price
                      else coalesce(c.our_price,0)
                    end) > 0
                and c.last_updated >= (now() - (? || ' days')::interval)
            ),
            calc as (
              select
                last_updated,
                bench,
                our,
                (our - bench) as gap_kr,
                case when bench > 0 then (our - bench)/bench else null end as gap_pct,
                (bench * ?) as tol_kr
              from base
            )
            select
              avg(bench) as avg_market,
              avg(our) as avg_our,
              avg(gap_kr) as avg_gap_kr,
              avg(gap_pct) as avg_gap_pct,
              sum(case when gap_kr < -tol_kr then 1 else 0 end)::bigint as cheaper,
              sum(case when gap_kr >  tol_kr then 1 else 0 end)::bigint as more_expensive,
              sum(case when gap_kr >= -tol_kr and gap_kr <= tol_kr then 1 else 0 end)::bigint as similar,
              sum(case when gap_kr >  tol_kr then 1 else 0 end)::bigint as overpriced,
              sum(case when gap_kr < -tol_kr then 1 else 0 end)::bigint as underpriced,
              sum(case when abs(coalesce(gap_pct,0)) >= ? then 1 else 0 end)::bigint as outliers,
              max(last_updated) as freshness
            from calc
        """, days, SIMILAR_TOL_PCT, OUTLIER_ABS_GAP_PCT);

        double avgMarket = d(agg.get("avg_market"));
        double avgOur = d(agg.get("avg_our"));
        double avgGapKr = d(agg.get("avg_gap_kr"));
        double avgGapPct = d(agg.get("avg_gap_pct"));

        long cheaper = l(agg.get("cheaper"));
        long similar = l(agg.get("similar"));
        long moreExpensive = l(agg.get("more_expensive"));

        long overPriced = l(agg.get("overpriced"));
        long underPriced = l(agg.get("underpriced"));
        long outliers = l(agg.get("outliers"));

        Instant freshness = tsToInstant(agg.get("freshness"));

        double cheaperPct = matchedPriced == 0 ? 0 : (cheaper * 100.0 / matchedPriced);
        double similarPct = matchedPriced == 0 ? 0 : (similar * 100.0 / matchedPriced);
        double moreExpPct = matchedPriced == 0 ? 0 : (moreExpensive * 100.0 / matchedPriced);
        double matchRatePct = totalProducts == 0 ? 0 : (matchedMarket * 100.0 / totalProducts);

        double priceIndex = avgMarket == 0 ? 0 : (avgOur / avgMarket) * 100.0;

        long benchHasOffersCount = qLong("""
            select count(*)
            from company_listings c
            join product_market_snapshot s on s.product_id = c.matched_product_id
            where c.matched_product_id is not null
              and s.offers_count is not null and s.offers_count > 0
        """);

        long benchFromMinMaxOrOffers = qLong("""
            select count(*)
            from company_listings c
            join product_market_snapshot s on s.product_id = c.matched_product_id
            where c.matched_product_id is not null
              and (
                (s.price_min is not null and s.price_min > 0)
                or (s.price_max is not null and s.price_max > 0)
                or (s.offers_count is not null and s.offers_count > 0)
              )
        """);

        long benchFallbackPriceOnly = Math.max(0, matchedMarket - benchFromMinMaxOrOffers);

        double matchedMarketRate = totalProducts == 0 ? 0 : (matchedMarket * 100.0 / totalProducts);
        double pricedCoverageRate = matchedMarket == 0 ? 0 : (matchedPriced * 100.0 / matchedMarket);
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
        actionCounts.put("MISSING_COMPARABLE", companyMissingComparable);
        actionCounts.put("MISSING_BENCHMARK", marketMissingPriceSignal);

        actionCounts.put("MATCHED_MARKET", matchedMarket);
        actionCounts.put("MATCHED_PRICED", matchedPriced);

        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalProducts", totalProducts);
        coverage.put("matchedMarket", matchedMarket);
        coverage.put("matchedPriced", matchedPriced);
        coverage.put("needsPricing", Math.max(0, matchedMarket - matchedPriced));
        coverage.put("matchedMarketRatePct", round2(matchedMarketRate));
        coverage.put("pricedCoverageRatePct", round2(pricedCoverageRate));

        Map<String, Object> quality = new LinkedHashMap<>();
        quality.put("benchmarkQuality", benchmarkQuality);
        quality.put("benchmarkQualityRatePct", round2(qualityRate));
        quality.put("benchFromMinMaxOrOffers", benchFromMinMaxOrOffers);
        quality.put("benchFallbackPriceOnly", benchFallbackPriceOnly);
        quality.put("benchHasOffersCount", benchHasOffersCount);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("days", days);
        meta.put("storage", "DB");

        meta.put("marketPath", marketPath);
        meta.put("companyPath", companyPath);
        meta.put("useEnrichedMarket", useEnrichedMarket);

        meta.put("similarTolerancePct", 0.5);
        meta.put("outlierAbsGapPct", OUTLIER_ABS_GAP_PCT * 100.0);

        meta.put("benchmarkDefinition",
                "benchmark = median(offers.price) from product_market_snapshot");
        meta.put("ourComparablePriceDefinition",
                "MANUAL->manual_price; else our_price");
        meta.put("gapDefinition",
                "gapKr = ourComparablePrice - benchmark");
        meta.put("priceIndexDefinition",
                "priceIndex = (avgOurPrice/avgMarketPrice)*100");

        meta.put("actionCounts", actionCounts);
        meta.put("coverage", coverage);
        meta.put("quality", quality);

        Map<String, Object> health = new LinkedHashMap<>();
        health.put("computedAt", Instant.now().toString());
        health.put("dataFreshness", freshness == null ? null : freshness.toString());
        health.put("ok", true);
        health.put("notes", switch (benchmarkQuality) {
            case "HIGH" -> "Benchmark quality HIGH: min/max/offers används ofta.";
            case "MED" -> "Benchmark quality MED: blandat min/max/offers och fallback.";
            default -> "Benchmark quality LOW: benchmark bygger mest på fallback.";
        });
        meta.put("health", health);

        return new DashboardOverview(
                true,
                totalProducts,
                matchedMarket,
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
                companyMissingComparable,
                marketMissingPriceSignal,

                meta
        );
    }

    private DashboardOverview legacyOverview(int days) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("days", days);
        meta.put("storage", "FILES");
        meta.put("marketPath", marketPath);
        meta.put("companyPath", companyPath);
        meta.put("useEnrichedMarket", useEnrichedMarket);
        meta.put("health", Map.of(
                "computedAt", Instant.now().toString(),
                "ok", true,
                "notes", "FILES-mode: dashboard använder DataStoreService."
        ));

        return new DashboardOverview(
                true,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                Instant.now(),
                0,
                0,
                0,
                meta
        );
    }

    private long qLong(String sql) {
        try {
            Long v = jdbc.queryForObject(sql, Long.class);
            return v == null ? 0L : v;
        } catch (Exception e) {
            return 0L;
        }
    }

    private static double d(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    private static long l(Object o) {
        if (o == null) return 0;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    private static Instant tsToInstant(Object o) {
        if (o == null) return null;
        if (o instanceof Timestamp ts) return ts.toInstant();
        try {
            return Instant.parse(String.valueOf(o));
        } catch (Exception e) {
            return null;
        }
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}