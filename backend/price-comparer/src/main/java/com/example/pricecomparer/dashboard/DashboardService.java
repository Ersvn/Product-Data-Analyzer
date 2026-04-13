package com.example.pricecomparer.dashboard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class DashboardService {

    private static final double SIMILAR_TOL_PCT = 0.005;
    private static final double OUTLIER_ABS_GAP_PCT = 0.50;

    private final JdbcTemplate jdbc;
    private final WorkQueueService workQueueService;

    public DashboardService(JdbcTemplate jdbc, WorkQueueService workQueueService) {
        this.jdbc = jdbc;
        this.workQueueService = workQueueService;
    }

    public DashboardOverview overview(int days) {
        Long totalProducts = qLong("select count(*) from company_listings");

        Long matchedProducts = qLong("""
            select count(*)
            from company_listings c
            join scraped_market_rollup r
              on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
              or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
        """);

        Long companyMissingEanCount = qLong("""
            select count(*)
            from company_listings
            where nullif(regexp_replace(coalesce(ean, ''), '[^0-9]', '', 'g'), '') is null
              and nullif(regexp_replace(upper(coalesce(mpn, '')), '[^0-9A-Z]', '', 'g'), '') is null
        """);

        Long companyMissingEffectivePriceCount = qLong("""
            select count(*)
            from company_listings
            where (
                case
                    when upper(coalesce(price_mode, 'AUTO')) = 'MANUAL'
                         and coalesce(manual_price, 0) > 0
                        then manual_price
                    else coalesce(our_price, 0)
                end
            ) <= 0
        """);

        Long marketMissingPriceSignalCount = qLong("""
            select count(*)
            from company_listings c
            left join scraped_market_rollup r
              on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
              or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
            where r.uid is null
               or coalesce(r.offers_count, 0) <= 0
               or (
                    coalesce(r.price_median, 0) <= 0
                and coalesce(r.price_min, 0) <= 0
                and coalesce(r.price_max, 0) <= 0
               )
        """);

        Map<String, Object> metrics = jdbc.queryForMap("""
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
                end as benchmark_price
              from company_listings c
              join scraped_market_rollup r
                on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
                or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
            ),
            calc as (
              select
                *,
                (our_price_eff - benchmark_price) as gap_kr,
                case
                  when benchmark_price > 0 then (our_price_eff - benchmark_price) / benchmark_price
                  else null
                end as gap_pct,
                (benchmark_price * ?) as tol_kr
              from base
              where benchmark_price is not null
                and benchmark_price > 0
                and our_price_eff > 0
            )
            select
              count(*) as comparable_count,
              count(*) filter (where gap_kr < -tol_kr) as cheaper_count,
              count(*) filter (where abs(gap_kr) <= tol_kr) as similar_count,
              count(*) filter (where gap_kr > tol_kr) as more_expensive_count,
              count(*) filter (where abs(gap_pct) >= ?) as outlier_count,
              coalesce(sum(case when gap_kr > tol_kr then gap_kr else 0 end), 0) as total_overprice_kr,
              coalesce(avg(abs(gap_kr)), 0) as avg_abs_gap_kr,
              coalesce(avg(benchmark_price), 0) as avg_market_price,
              coalesce(avg(our_price_eff), 0) as avg_our_price,
              coalesce(avg(gap_kr), 0) as avg_gap_kr,
              coalesce(avg(gap_pct), 0) as avg_gap_pct,
              max(greatest(0, coalesce(price_min, 0), coalesce(price_max, 0), coalesce(price_median, 0))) as strongest_market_signal
            from calc
        """, SIMILAR_TOL_PCT, OUTLIER_ABS_GAP_PCT);

        long comparable = numL(metrics.get("comparable_count"));
        long cheaperCount = numL(metrics.get("cheaper_count"));
        long similarCount = numL(metrics.get("similar_count"));
        long moreExpensiveCount = numL(metrics.get("more_expensive_count"));
        long outlierCount = numL(metrics.get("outlier_count"));

        double totalOverpriceKr = numD(metrics.get("total_overprice_kr"));
        double avgAbsGapKr = numD(metrics.get("avg_abs_gap_kr"));
        double avgMarketPrice = numD(metrics.get("avg_market_price"));
        double avgOurPrice = numD(metrics.get("avg_our_price"));
        double avgGapKr = numD(metrics.get("avg_gap_kr"));
        double avgGapPct = numD(metrics.get("avg_gap_pct"));

        double matchRatePct = pct(matchedProducts, totalProducts);
        double cheaperPct = pct(cheaperCount, comparable);
        double similarPct = pct(similarCount, comparable);
        double moreExpensivePct = pct(moreExpensiveCount, comparable);
        double priceIndex = avgMarketPrice > 0 ? (avgOurPrice / avgMarketPrice) * 100.0 : 0.0;

        Instant dataFreshness = qInstant();

        Map<String, Object> actionCounts = new LinkedHashMap<>();
        actionCounts.put("UNDERPRICED", cheaperCount);
        actionCounts.put("OVERPRICED", moreExpensiveCount);
        actionCounts.put("OUTLIERS", outlierCount);

        Map<String, Long> queueCounts = workQueueService.summarizeActionCounts();
        actionCounts.put("OVERPRICED", queueCounts.getOrDefault("OVERPRICED", 0L));
        actionCounts.put("UNDERPRICED", queueCounts.getOrDefault("UNDERPRICED", 0L));
        actionCounts.put("OUTLIERS", queueCounts.getOrDefault("OUTLIERS", 0L));

        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalProducts", nz(totalProducts));
        coverage.put("matchedProducts", nz(matchedProducts));
        coverage.put("comparableCount", comparable);
        coverage.put("matchedPriced", comparable);
        coverage.put("needsPricing", Math.max(0, nz(matchedProducts) - comparable));
        coverage.put("matchRatePct", round2(matchRatePct));
        coverage.put("companyMissingEanCount", nz(companyMissingEanCount));
        coverage.put("companyMissingEffectivePriceCount", nz(companyMissingEffectivePriceCount));
        coverage.put("marketMissingPriceSignalCount", nz(marketMissingPriceSignalCount));

        Map<String, Object> pricing = new LinkedHashMap<>();
        pricing.put("totalOverpriceKr", round2(totalOverpriceKr));
        pricing.put("avgAbsGapKr", round2(avgAbsGapKr));
        pricing.put("avgGapKr", round2(avgGapKr));
        pricing.put("avgGapPct", round4(avgGapPct));
        pricing.put("avgMarketPrice", round2(avgMarketPrice));
        pricing.put("avgOurPrice", round2(avgOurPrice));
        pricing.put("priceIndex", round2(priceIndex));

        Map<String, Object> quality = new LinkedHashMap<>();
        quality.put("marketSource", "SCRAPED");
        quality.put("similarTolerancePct", SIMILAR_TOL_PCT * 100.0);
        quality.put("outlierAbsGapPct", OUTLIER_ABS_GAP_PCT * 100.0);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("days", days);
        meta.put("storage", "DB");
        meta.put("benchmarkDefinition", "benchmark = scraped_market_rollup.price_median, fallback avg(min,max), fallback min/max");
        meta.put("ourComparablePriceDefinition", "MANUAL->manual_price; else our_price");
        meta.put("gapDefinition", "gapKr = ourComparablePrice - benchmark");
        meta.put("priceIndexDefinition", "priceIndex = (avgOurPrice/avgMarketPrice)*100");
        meta.put("actionCounts", actionCounts);
        meta.put("coverage", coverage);
        meta.put("pricing", pricing);
        meta.put("quality", quality);

        return new DashboardOverview(
                true,
                nz(totalProducts),
                nz(matchedProducts),
                round2(matchRatePct),
                cheaperCount,
                similarCount,
                moreExpensiveCount,
                round2(cheaperPct),
                round2(similarPct),
                round2(moreExpensivePct),
                round2(avgMarketPrice),
                round2(avgOurPrice),
                round2(avgGapKr),
                round4(avgGapPct),
                round2(priceIndex),
                dataFreshness,
                nz(companyMissingEanCount),
                nz(companyMissingEffectivePriceCount),
                nz(marketMissingPriceSignalCount),
                meta
        );
    }

    private Long qLong(String sql) {
        try {
            Long v = jdbc.queryForObject(sql, Long.class);
            return v == null ? 0L : v;
        } catch (Exception e) {
            return 0L;
        }
    }

    private Instant qInstant() {
        try {
            Timestamp ts = jdbc.queryForObject("""
                        select max(last_scraped)
                        from scraped_products
                    """, Timestamp.class);
            return ts == null ? null : ts.toInstant();
        } catch (Exception e) {
            return null;
        }
    }

    private long nz(Long v) {
        return v == null ? 0L : v;
    }

    private double pct(long part, long total) {
        if (total <= 0) return 0.0;
        return (part * 100.0) / total;
    }

    private long numL(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception e) {
            return 0L;
        }
    }

    private double numD(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (Exception e) {
            return 0.0;
        }
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}