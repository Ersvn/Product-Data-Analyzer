package com.example.pricecomparer.dashboard;

import com.example.pricecomparer.db.DbSql;
import com.example.pricecomparer.db.DbValueUtils;
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
        long totalProducts = qLong("select count(*) from company_listings");
        long matchedProducts = qLong("select count(distinct c.id) from company_listings c join scraped_market_rollup r on %s".formatted(DbSql.COMPANY_TO_MARKET_JOIN));
        long companyMissingEanCount = qLong("""
            select count(*)
            from company_listings
            where nullif(regexp_replace(coalesce(ean, ''), '[^0-9]', '', 'g'), '') is null
              and nullif(regexp_replace(upper(coalesce(mpn, '')), '[^0-9A-Z]', '', 'g'), '') is null
            """);
        long companyMissingEffectivePriceCount = qLong("select count(*) from company_listings c where (%s) <= 0".formatted(DbSql.EFFECTIVE_PRICE_SQL));
        long marketMissingPriceSignalCount = qLong("""
            select count(distinct c.id)
            from company_listings c
            left join scraped_market_rollup r on %s
            where r.uid is null
               or coalesce(r.offers_count, 0) <= 0
               or (coalesce(r.price_median, 0) <= 0 and coalesce(r.price_min, 0) <= 0 and coalesce(r.price_max, 0) <= 0)
            """.formatted(DbSql.COMPANY_TO_MARKET_JOIN));

        Map<String, Object> metrics = jdbc.queryForMap("""
            with base as (
              select
                c.id,
                r.offers_count,
                r.price_min,
                r.price_max,
                r.price_median,
                %s as our_price_eff,
                %s as benchmark_price
              from company_listings c
              join scraped_market_rollup r on %s
            ),
            calc as (
              select
                *,
                (our_price_eff - benchmark_price) as gap_kr,
                case when benchmark_price > 0 then (our_price_eff - benchmark_price) / benchmark_price else null end as gap_pct,
                (benchmark_price * ?) as tol_kr
              from base
              where benchmark_price is not null and benchmark_price > 0 and our_price_eff > 0
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
              coalesce(avg(gap_pct), 0) as avg_gap_pct
            from calc
            """.formatted(DbSql.EFFECTIVE_PRICE_SQL, DbSql.BENCHMARK_PRICE_SQL, DbSql.COMPANY_TO_MARKET_JOIN), SIMILAR_TOL_PCT, OUTLIER_ABS_GAP_PCT);

        long comparable = longMetric(metrics, "comparable_count");
        long cheaperCount = longMetric(metrics, "cheaper_count");
        long similarCount = longMetric(metrics, "similar_count");
        long moreExpensiveCount = longMetric(metrics, "more_expensive_count");
        long outlierCount = longMetric(metrics, "outlier_count");

        double avgMarketPrice = doubleMetric(metrics, "avg_market_price");
        double avgOurPrice = doubleMetric(metrics, "avg_our_price");
        double avgGapKr = doubleMetric(metrics, "avg_gap_kr");
        double avgGapPct = doubleMetric(metrics, "avg_gap_pct");

        double matchRatePct = pct(matchedProducts, totalProducts);
        double cheaperPct = pct(cheaperCount, comparable);
        double similarPct = pct(similarCount, comparable);
        double moreExpensivePct = pct(moreExpensiveCount, comparable);
        double priceIndex = avgMarketPrice > 0 ? (avgOurPrice / avgMarketPrice) * 100.0 : 0.0;

        Map<String, Object> meta = buildMeta(days,
                workQueueService.summarizeActionCounts(),
                totalProducts,
                matchedProducts,
                comparable,
                companyMissingEanCount,
                companyMissingEffectivePriceCount,
                marketMissingPriceSignalCount,
                metrics,
                matchRatePct,
                priceIndex
        );

        return new DashboardOverview(
                true,
                totalProducts,
                matchedProducts,
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
                latestFreshness(),
                companyMissingEanCount,
                companyMissingEffectivePriceCount,
                marketMissingPriceSignalCount,
                meta
        );
    }

    private Map<String, Object> buildMeta(
            int days,
            Map<String, Long> actionCounts,
            long totalProducts,
            long matchedProducts,
            long comparable,
            long companyMissingEanCount,
            long companyMissingEffectivePriceCount,
            long marketMissingPriceSignalCount,
            Map<String, Object> metrics,
            double matchRatePct,
            double priceIndex
    ) {
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("totalProducts", totalProducts);
        coverage.put("matchedProducts", matchedProducts);
        coverage.put("comparableCount", comparable);
        coverage.put("matchedPriced", comparable);
        coverage.put("needsPricing", Math.max(0, matchedProducts - comparable));
        coverage.put("matchRatePct", round2(matchRatePct));
        coverage.put("companyMissingEanCount", companyMissingEanCount);
        coverage.put("companyMissingEffectivePriceCount", companyMissingEffectivePriceCount);
        coverage.put("marketMissingPriceSignalCount", marketMissingPriceSignalCount);

        Map<String, Object> pricing = new LinkedHashMap<>();
        pricing.put("totalOverpriceKr", round2(doubleMetric(metrics, "total_overprice_kr")));
        pricing.put("avgAbsGapKr", round2(doubleMetric(metrics, "avg_abs_gap_kr")));
        pricing.put("avgGapKr", round2(doubleMetric(metrics, "avg_gap_kr")));
        pricing.put("avgGapPct", round4(doubleMetric(metrics, "avg_gap_pct")));
        pricing.put("avgMarketPrice", round2(doubleMetric(metrics, "avg_market_price")));
        pricing.put("avgOurPrice", round2(doubleMetric(metrics, "avg_our_price")));
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
        return meta;
    }

    private long qLong(String sql) {
        try {
            Long value = jdbc.queryForObject(sql, Long.class);
            return value == null ? 0L : value;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private Instant latestFreshness() {
        try {
            Timestamp ts = jdbc.queryForObject("select max(last_scraped) from scraped_products", Timestamp.class);
            return ts == null ? null : ts.toInstant();
        } catch (Exception ignored) {
            return null;
        }
    }

    private long longMetric(Map<String, Object> metrics, String key) {
        Long value = DbValueUtils.longOrNull(metrics.get(key));
        return value == null ? 0L : value;
    }

    private double doubleMetric(Map<String, Object> metrics, String key) {
        return DbValueUtils.doubleOrZero(metrics.get(key));
    }

    private double pct(long part, long total) {
        return total <= 0 ? 0.0 : (part * 100.0) / total;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
