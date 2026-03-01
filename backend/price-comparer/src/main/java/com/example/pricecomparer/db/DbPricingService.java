package com.example.pricecomparer.db;

import com.example.pricing.core.MarketSnapshot;
import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingResult;
import com.example.pricing.core.PricingStrategyEngine;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Service
public class DbPricingService {

    private final JdbcTemplate jdbc;
    private final PricingStrategyEngine engine;

    public DbPricingService(JdbcTemplate jdbc, PricingStrategyEngine engine) {
        this.jdbc = jdbc;
        this.engine = engine;
    }

    public Map<String, Object> productViewByEan(String eanRaw) {
        String ean = normEan(eanRaw);
        if (ean.isBlank()) return Map.of("ok", false, "error", "BAD_REQUEST", "message", "ean is required");

        Long productId;
        try {
            productId = jdbc.queryForObject("select id from products where ean = ?", Long.class, ean);
        } catch (EmptyResultDataAccessException ex) {
            return Map.of("ok", false, "error", "PRODUCT_NOT_FOUND", "ean", ean);
        }

        Map<String, Object> company = latestCompanyListingByEan(ean);
        Map<String, Object> snapshot = snapshotByProductId(productId);
        List<Map<String, Object>> offers = offersByProductId(productId);

        BigDecimal recommended = null;
        if (company != null && snapshot != null) {
            recommended = computeRecommended(company, snapshot);
        }

        return Map.of(
                "ok", true,
                "ean", ean,
                "productId", productId,
                "company", company,
                "snapshot", snapshot,
                "recommendedPrice", recommended,
                "offers", offers
        );
    }

    public Map<String, Object> productViewByCompanyId(long companyId) {
        Map<String, Object> company;
        try {
            company = jdbc.queryForMap("select * from company_listings where id = ?", companyId);
        } catch (EmptyResultDataAccessException ex) {
            return Map.of("ok", false, "error", "NOT_FOUND", "message", "company_listing not found");
        }

        String ean = company.get("ean") == null ? "" : normEan(String.valueOf(company.get("ean")));
        if (ean.isBlank()) {
            return Map.of("ok", true, "company", company, "snapshot", null, "recommendedPrice", null, "offers", List.of());
        }

        Long productId;
        try {
            productId = jdbc.queryForObject("select id from products where ean = ?", Long.class, ean);
        } catch (EmptyResultDataAccessException ex) {
            return Map.of("ok", true, "ean", ean, "company", company, "productId", null, "snapshot", null, "recommendedPrice", null, "offers", List.of());
        }

        Map<String, Object> snapshot = snapshotByProductId(productId);
        List<Map<String, Object>> offers = offersByProductId(productId);

        BigDecimal recommended = null;
        if (snapshot != null) {
            recommended = computeRecommended(company, snapshot);
        }

        return Map.of(
                "ok", true,
                "ean", ean,
                "productId", productId,
                "company", company,
                "snapshot", snapshot,
                "recommendedPrice", recommended,
                "offers", offers
        );
    }

    @Transactional
    public Map<String, Object> applyAutoByCompanyListingId(long companyListingId) {
        Map<String, Object> company;
        try {
            company = jdbc.queryForMap("""
                select id, ean, price_mode, our_price, manual_price, cost_price, company_sku
                from company_listings
                where id = ?
            """, companyListingId);
        } catch (EmptyResultDataAccessException ex) {
            return Map.of("ok", false, "error", "NOT_FOUND", "message", "company_listing not found");
        }

        String mode = company.get("price_mode") == null ? "AUTO" : String.valueOf(company.get("price_mode")).toUpperCase(Locale.ROOT);
        if ("MANUAL".equals(mode)) {
            return Map.of("ok", false, "error", "CONFLICT", "message", "priceMode=MANUAL; refusing to overwrite");
        }

        String ean = company.get("ean") == null ? "" : normEan(String.valueOf(company.get("ean")));
        if (ean.isBlank()) {
            return Map.of("ok", false, "error", "BAD_REQUEST", "message", "listing has no ean");
        }

        Long productId;
        try {
            productId = jdbc.queryForObject("select id from products where ean = ?", Long.class, ean);
        } catch (EmptyResultDataAccessException ex) {
            return Map.of("ok", false, "error", "PRODUCT_NOT_FOUND", "ean", ean);
        }

        Map<String, Object> snapshot = snapshotByProductId(productId);
        if (snapshot == null) {
            return Map.of("ok", false, "error", "NO_MARKET", "message", "no market snapshot for product", "ean", ean);
        }

        BigDecimal recommended = computeRecommended(company, snapshot);
        if (recommended == null || recommended.signum() <= 0) {
            return Map.of("ok", false, "error", "NO_RECOMMENDED", "message", "could not compute recommended price", "ean", ean);
        }

        int updated = jdbc.update("""
            update company_listings
            set our_price = ?,
                last_updated = now()
            where id = ?
              and price_mode = 'AUTO'
        """, recommended, companyListingId);

        return Map.of(
                "ok", true,
                "id", companyListingId,
                "ean", ean,
                "recommendedPrice", recommended,
                "updated", updated
        );
    }

    // ============================================================
    // ✅ SCRAPED MARKET VIEW
    // ============================================================
    public Map<String, Object> scrapedProductViewByUid(String uidRaw) {
        String uid = normUid(uidRaw);
        if (uid.isBlank()) return Map.of("ok", false, "error", "BAD_REQUEST", "message", "uid is required");

        try {
            // Rollup (if you created scraped_market_rollup)
            Map<String, Object> rollup = null;
            try {
                rollup = jdbc.queryForMap("""
                    select *
                    from scraped_market_rollup
                    where uid = ?
                """, uid);
            } catch (EmptyResultDataAccessException ignored) {
                rollup = null;
            }

            // Offers (always from scraped_products)
            List<Map<String, Object>> offers = jdbc.queryForList("""
                select
                  site_name,
                  price,
                  url,
                  last_scraped,
                  name,
                  ean_norm,
                  mpn_norm,
                  ean,
                  mpn
                from scraped_products
                where coalesce(ean_norm, mpn_norm) = ?
                  and price is not null
                  and price > 0
                order by price asc
            """, uid);

            // Compute recommended median directly from offers (robust)
            BigDecimal median = null;
            try {
                median = jdbc.queryForObject("""
                    select
                      percentile_cont(0.5) within group (order by price)::numeric
                    from scraped_products
                    where coalesce(ean_norm, mpn_norm) = ?
                      and price is not null and price > 0
                """, BigDecimal.class, uid);
            } catch (Exception ignored) {
                median = null;
            }

            BigDecimal min = null;
            BigDecimal max = null;
            try {
                Map<String, Object> mm = jdbc.queryForMap("""
                    select
                      min(price) as price_min,
                      max(price) as price_max
                    from scraped_products
                    where coalesce(ean_norm, mpn_norm) = ?
                      and price is not null and price > 0
                """, uid);

                min = dec(mm.get("price_min"));
                max = dec(mm.get("price_max"));
            } catch (Exception ignored) {
                // keep nulls
            }

            Integer offersCount = offers.size();

            // Attempt to surface ean/mpn/display_name for UI convenience
            String ean = null;
            String mpn = null;
            String displayName = null;

            if (rollup != null) {
                ean = rollup.get("ean") == null ? null : String.valueOf(rollup.get("ean"));
                mpn = rollup.get("mpn") == null ? null : String.valueOf(rollup.get("mpn"));
                displayName = rollup.get("display_name") == null ? null : String.valueOf(rollup.get("display_name"));
                if (min == null) min = dec(rollup.get("price_min"));
                if (max == null) max = dec(rollup.get("price_max"));
                if (median == null) median = dec(rollup.get("price_median"));
                if (offersCount == 0) offersCount = intOrNull(rollup.get("offers_count")) == null ? 0 : intOrNull(rollup.get("offers_count"));
            }

            if ((displayName == null || displayName.isBlank()) && !offers.isEmpty()) {
                Object n = offers.get(0).get("name");
                displayName = n == null ? null : String.valueOf(n);
            }

            // If rollup didn't have ean/mpn, try from first offer
            if ((ean == null || ean.isBlank()) && !offers.isEmpty()) {
                Object x = offers.get(0).get("ean");
                if (x != null) ean = String.valueOf(x);
            }
            if ((mpn == null || mpn.isBlank()) && !offers.isEmpty()) {
                Object x = offers.get(0).get("mpn");
                if (x != null) mpn = String.valueOf(x);
            }

            // Return a consistent shape your drawer expects
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("uid", uid);

            Map<String, Object> roll = new LinkedHashMap<>();
            roll.put("uid", uid);
            roll.put("display_name", displayName);
            roll.put("ean", ean);
            roll.put("mpn", mpn);
            roll.put("offers_count", offersCount);
            roll.put("price_min", min);
            roll.put("price_max", max);
            roll.put("price_median", median);

            out.put("rollup", roll);
            out.put("recommendedPrice", median);
            out.put("offersCount", offersCount);
            out.put("priceMin", min);
            out.put("priceMax", max);
            out.put("offers", offers);

            return out;
        } catch (Exception e) {
            // ✅ instead of 500 with empty message, return JSON error
            return Map.of(
                    "ok", false,
                    "error", "INTERNAL_ERROR",
                    "message", (e.getMessage() == null || e.getMessage().isBlank()) ? "Server error" : e.getMessage(),
                    "uid", uid
            );
        }
    }

    // ------------------------
    // Core-engine compute
    // ------------------------
    private BigDecimal computeRecommended(Map<String, Object> company, Map<String, Object> snap) {
        BigDecimal cost = dec(company.get("cost_price"));
        BigDecimal current = dec(company.get("our_price"));
        if (current == null || current.signum() <= 0) {
            var mp = dec(company.get("manual_price"));
            if (mp != null && mp.signum() > 0) current = mp;
        }

        BigDecimal marketMin = dec(snap.get("price_min"));
        BigDecimal marketMax = dec(snap.get("price_max"));
        Integer competitors = intOrNull(snap.get("offers_count"));

        BigDecimal base = dec(snap.get("benchmark_price"));
        if (base == null || base.signum() <= 0) {
            if (marketMin != null && marketMax != null && marketMin.signum() > 0 && marketMax.signum() > 0) {
                base = marketMin.add(marketMax).divide(new BigDecimal("2"), 2, java.math.RoundingMode.HALF_UP);
            } else if (marketMin != null && marketMin.signum() > 0) base = marketMin;
            else if (marketMax != null && marketMax.signum() > 0) base = marketMax;
            else if (current != null && current.signum() > 0) base = current;
            else base = BigDecimal.ZERO;
        }

        var market = new MarketSnapshot(marketMin, marketMax, competitors);

        String sku = company.get("company_sku") == null ? null : String.valueOf(company.get("company_sku"));

        var ctx = new PricingContext(
                sku,
                cost,
                current,
                market,
                Map.of("source", "db")
        );

        PricingResult res = engine.price(ctx, base);
        return res.finalPrice();
    }

    // ------------------------
    // DB reads
    // ------------------------
    private Map<String, Object> latestCompanyListingByEan(String ean) {
        var rows = jdbc.queryForList("""
            select *
            from company_listings
            where ean = ?
            order by last_updated desc nulls last
            limit 1
        """, ean);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> snapshotByProductId(Long productId) {
        try {
            return jdbc.queryForMap("""
                select *
                from product_market_snapshot
                where product_id = ?
            """, productId);
        } catch (EmptyResultDataAccessException ex) {
            return null;
        }
    }

    private List<Map<String, Object>> offersByProductId(Long productId) {
        return jdbc.queryForList("""
            select
              m.name as merchant,
              o.price,
              o.currency,
              o.in_stock,
              o.url,
              o.fetched_at
            from offers o
            join merchants m on m.id = o.merchant_id
            where o.product_id = ?
            order by o.price asc nulls last
        """, productId);
    }

    // ------------------------
    // Helpers
    // ------------------------
    private static String normEan(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^0-9]", "");
    }

    private static String normUid(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        // uid is ean_norm/mpn_norm => keep digits/letters only
        return s.replaceAll("[^0-9A-Za-z]", "");
    }

    private static BigDecimal dec(Object v) {
        if (v == null) return null;
        try {
            if (v instanceof BigDecimal bd) return bd;
            if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
            String s = String.valueOf(v).trim().replace(",", ".");
            if (s.isBlank()) return null;
            return new BigDecimal(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Integer intOrNull(Object v) {
        if (v == null) return null;
        try {
            if (v instanceof Number n) return n.intValue();
            String s = String.valueOf(v).trim();
            if (s.isBlank()) return null;
            return Integer.parseInt(s);
        } catch (Exception ignored) {
            return null;
        }
    }
}