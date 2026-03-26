package com.example.pricecomparer.db;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class DbController {

    private final JdbcTemplate jdbc;
    private final DbImportService importSvc;
    private final DbMatchingService matchSvc;
    private final DbPricingService pricingSvc;

    public DbController(JdbcTemplate jdbc, DbImportService importSvc, DbMatchingService matchSvc, DbPricingService pricingSvc) {
        this.jdbc = jdbc;
        this.importSvc = importSvc;
        this.matchSvc = matchSvc;
        this.pricingSvc = pricingSvc;
    }

    // -------------------------
    // Import
    // -------------------------
    @PostMapping("/api/db/import")
    public Map<String, Object> importAll() throws Exception {
        return importSvc.importAll();
    }

    // -------------------------
    // Company listings (list + patch)
    // -------------------------
    @GetMapping("/api/db/company-listings")
    public Map<String, Object> listCompanyListings(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "0") long afterId,
            @RequestParam(required = false) String q
    ) {
        if (limit < 1) limit = 1;
        if (limit > 500) limit = 500;

        String query = (q == null) ? "" : q.trim();
        boolean hasQ = !query.isBlank();

        List<Map<String, Object>> items;

        if (!hasQ) {
            items = jdbc.queryForList("""
                select
                  id,
                  company_sku,
                  ean,
                  mpn,
                  name,
                  brand,
                  category,
                  our_price,
                  cost_price,
                  price_mode,
                  manual_price,
                  matched_product_id,
                  last_updated
                from company_listings
                where id > ?
                order by id asc
                limit ?
            """, afterId, limit);
        } else {
            String like = "%" + query.toLowerCase() + "%";
            items = jdbc.queryForList("""
                select
                  id,
                  company_sku,
                  ean,
                  mpn,
                  name,
                  brand,
                  category,
                  our_price,
                  cost_price,
                  price_mode,
                  manual_price,
                  matched_product_id,
                  last_updated
                from company_listings
                where id > ?
                  and (
                    lower(company_sku) like ?
                    or lower(coalesce(ean,'')) like ?
                    or lower(coalesce(mpn,'')) like ?
                    or lower(coalesce(name,'')) like ?
                    or lower(coalesce(brand,'')) like ?
                  )
                order by id asc
                limit ?
            """, afterId, like, like, like, like, like, limit);
        }

        long nextAfterId = afterId;
        if (!items.isEmpty()) {
            Object lastId = items.get(items.size() - 1).get("id");
            if (lastId instanceof Number n) nextAfterId = n.longValue();
        }

        Map<String, Object> out = new HashMap<>();
        out.put("ok", true);
        out.put("limit", limit);
        out.put("afterId", afterId);
        out.put("nextAfterId", nextAfterId);
        out.put("q", query);
        out.put("items", items);
        return out;
    }

    @PatchMapping("/api/db/company-listings/{id}")
    public ResponseEntity<?> patchCompanyListing(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String priceMode = str(body, "priceMode", "price_mode");
        BigDecimal manualPrice = dec(body, "manualPrice", "manual_price");
        BigDecimal ourPrice = dec(body, "ourPrice", "our_price");
        BigDecimal costPrice = dec(body, "costPrice", "cost_price");

        if (priceMode != null && !priceMode.isBlank()) {
            String pm = priceMode.trim().toUpperCase();
            if (!pm.equals("AUTO") && !pm.equals("MANUAL")) {
                return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "priceMode must be AUTO or MANUAL"));
            }
            priceMode = pm;
        } else {
            priceMode = null;
        }

        if ("MANUAL".equals(priceMode) && manualPrice == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "manualPrice is required when priceMode=MANUAL"));
        }

        if ("MANUAL".equals(priceMode) && ourPrice == null) {
            ourPrice = manualPrice;
        }

        boolean clearManual = "AUTO".equals(priceMode) && !body.containsKey("manualPrice") && !body.containsKey("manual_price");
        BigDecimal manualToPersist = clearManual ? null : manualPrice;

        int updated = jdbc.update("""
            update company_listings
            set
              price_mode   = coalesce(?, price_mode),
              manual_price = ?,
              our_price    = coalesce(?, our_price),
              cost_price   = coalesce(?, cost_price),
              last_updated = now()
            where id = ?
        """, priceMode, manualToPersist, ourPrice, costPrice, id);

        if (updated == 0) {
            return ResponseEntity.status(404).body(Map.of("ok", false, "error", "Not found"));
        }

        Map<String, Object> item = jdbc.queryForMap("""
            select
              id,
              company_sku,
              ean,
              mpn,
              name,
              brand,
              category,
              our_price,
              cost_price,
              price_mode,
              manual_price,
              matched_product_id,
              last_updated
            from company_listings
            where id = ?
        """, id);

        return ResponseEntity.ok(Map.of("ok", true, "item", item));
    }

    // -------------------------
    // Apply auto (writes our_price when AUTO)
    // -------------------------
    @PostMapping("/api/db/company-listings/{id}/apply-auto")
    public Map<String, Object> applyAuto(@PathVariable("id") long id) {
        return pricingSvc.applyAutoByCompanyListingId(id);
    }

    // -------------------------
    // Product view (read-only view)
    // -------------------------
    @GetMapping("/api/db/product-view")
    public Map<String, Object> productView(@RequestParam String ean) {
        return pricingSvc.productViewByEan(ean);
    }

    @PostMapping("/api/db/company-listings/recompute-all-auto")
    public Map<String, Object> recomputeAllAuto() {
        return pricingSvc.recomputeAllAuto();
    }

    @GetMapping("/api/db/product-view/company")
    public Map<String, Object> productViewByCompany(@RequestParam long companyId) {
        return pricingSvc.productViewByCompanyId(companyId);
    }

    // -------------------------
    // Market list (no company listing yet)
    // -------------------------
    @GetMapping("/api/db/market-list")
    public Map<String, Object> marketList(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "") String afterUid,
            @RequestParam(required = false) String q
    ) {
        if (limit < 1) limit = 1;
        if (limit > 500) limit = 500;

        String query = (q == null) ? "" : q.trim().toLowerCase();
        boolean hasQ = !query.isBlank();
        String like = "%" + query + "%";

        String after = (afterUid == null) ? "" : afterUid.trim();

        List<Map<String, Object>> items;

        if (!hasQ) {
            items = jdbc.queryForList("""
            select
              uid,
              display_name,
              ean,
              mpn,
              offers_count,
              price_min,
              price_max,
              price_median,
              last_scraped,
              store_prices,
              store_urls,
              store_urls_all
            from scraped_market_rollup
            where uid > ?
            order by uid asc
            limit ?
        """, after, limit);
        } else {
            items = jdbc.queryForList("""
            select
              uid,
              display_name,
              ean,
              mpn,
              offers_count,
              price_min,
              price_max,
              price_median,
              last_scraped,
              store_prices,
              store_urls,
              store_urls_all
            from scraped_market_rollup
            where uid > ?
              and (
                lower(coalesce(uid,'')) like ?
                or lower(coalesce(display_name,'')) like ?
                or lower(coalesce(ean,'')) like ?
                or lower(coalesce(mpn,'')) like ?
              )
            order by uid asc
            limit ?
        """, after, like, like, like, like, limit);
        }

        String nextAfterUid = after;
        if (!items.isEmpty()) {
            Object last = items.get(items.size() - 1).get("uid");
            if (last != null) nextAfterUid = String.valueOf(last);
        }

        return Map.of(
                "ok", true,
                "limit", limit,
                "afterUid", after,
                "nextAfterUid", nextAfterUid,
                "q", query,
                "items", items
        );
    }

    // -------------------------
    // Seed + add listing (used by your UI)
    // -------------------------
    @PostMapping("/api/db/seed/company-listings")
    public Map<String, Object> seedCompanyListings(@RequestParam(defaultValue = "3") int minMerchants) {
        if (minMerchants < 1) minMerchants = 1;
        if (minMerchants > 50) minMerchants = 50;

        int affected = jdbc.update("""
            insert into company_listings (
              company_sku,
              ean,
              mpn,
              name,
              brand,
              category,
              price_mode,
              our_price,
              manual_price,
              last_updated
            )
            select
              'EAN:' || p.ean as company_sku,
              p.ean,
              p.mpn,
              coalesce(p.name, p.ean) as name,
              p.brand,
              p.category,
              'AUTO' as price_mode,
              null::numeric as our_price,
              null::numeric as manual_price,
              now() as last_updated
            from products p
            join offers o on o.product_id = p.id
            where p.ean is not null and p.ean <> ''
            group by p.ean, p.mpn, p.name, p.brand, p.category
            having count(distinct o.merchant_id) >= ?
            on conflict (ean) do update set
              company_sku = excluded.company_sku,
              ean = excluded.ean,
              mpn = excluded.mpn,
              name = excluded.name,
              brand = excluded.brand,
              category = excluded.category,
              our_price = excluded.our_price,
              last_updated = now(),
              price_mode = case
                            when company_listings.price_mode = 'MANUAL' then company_listings.price_mode
                            else excluded.price_mode
                          end,
              manual_price = case
                              when company_listings.price_mode = 'MANUAL' then company_listings.manual_price
                              else excluded.manual_price
                            end
        """, minMerchants);

        return Map.of("ok", true, "minMerchants", minMerchants, "affected", affected);
    }

    // -------------------------
// Scraped Market (DB)
// -------------------------
    @GetMapping("/api/db/scraped-market")
    public Map<String, Object> listScrapedMarket(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "") String afterUid,
            @RequestParam(required = false) String q
    ) {
        if (limit < 1) limit = 1;
        if (limit > 500) limit = 500;

        String query = (q == null) ? "" : q.trim().toLowerCase();
        boolean hasQ = !query.isBlank();
        String like = "%" + query + "%";

        List<Map<String, Object>> items;
        if (!hasQ) {
            items = jdbc.queryForList("""
            select uid, display_name, ean, mpn, offers_count, price_min, price_max, price_median, last_scraped
            from scraped_market_rollup
            where uid > ?
            order by uid asc
            limit ?
        """, afterUid, limit);
        } else {
            items = jdbc.queryForList("""
            select uid, display_name, ean, mpn, offers_count, price_min, price_max, price_median, last_scraped
            from scraped_market_rollup
            where uid > ?
              and (
                lower(coalesce(uid,'')) like ?
                or lower(coalesce(display_name,'')) like ?
                or lower(coalesce(ean,'')) like ?
                or lower(coalesce(mpn,'')) like ?
              )
            order by uid asc
            limit ?
        """, afterUid, like, like, like, like, limit);
        }

        String nextAfterUid = afterUid;
        if (!items.isEmpty()) {
            Object last = items.get(items.size() - 1).get("uid");
            nextAfterUid = last == null ? afterUid : String.valueOf(last);
        }

        return Map.of(
                "ok", true,
                "limit", limit,
                "afterUid", afterUid,
                "nextAfterUid", nextAfterUid,
                "q", query,
                "items", items
        );
    }

    @GetMapping("/api/db/scraped-product-view")
    public Map<String, Object> scrapedProductView(@RequestParam String uid) {
        return pricingSvc.scrapedProductViewByUid(uid);
    }


    @PostMapping("/api/db/company-listings/add")
    public Map<String, Object> addCompanyListingByEan(@RequestParam String ean) {
        String e = (ean == null ? "" : ean).replaceAll("[^0-9]", "");
        if (e.isBlank()) return Map.of("ok", false, "error", "BAD_REQUEST", "message", "ean is required");

        Map<String, Object> p = jdbc.queryForList("""
            select ean, mpn, name, brand, category
            from products
            where ean = ?
            limit 1
        """, e).stream().findFirst().orElse(null);

        String name = p == null ? e : String.valueOf(p.getOrDefault("name", e));
        String mpn = p == null ? null : (p.get("mpn") == null ? null : String.valueOf(p.get("mpn")));
        String brand = p == null ? null : (p.get("brand") == null ? null : String.valueOf(p.get("brand")));
        String category = p == null ? null : (p.get("category") == null ? null : String.valueOf(p.get("category")));

        jdbc.update("""
            insert into company_listings (company_sku, ean, mpn, name, brand, category, price_mode, last_updated)
            values (?, ?, ?, ?, ?, ?, 'MANUAL', now())
            on conflict (ean) do update
            set company_sku = excluded.company_sku,
                mpn = excluded.mpn,
                name = excluded.name,
                brand = excluded.brand,
                category = excluded.category,
                last_updated = now()
        """, "EAN:" + e, e, mpn, name, brand, category);

        return Map.of("ok", true, "ean", e, "companySku", "EAN:" + e);
    }

    // -------------------------
    // Matching
    // -------------------------
    @PostMapping("/api/db/match")
    public Map<String, Object> matchOne(@RequestParam long companyId) {
        return matchSvc.matchOneByCompanyId(companyId);
    }

    @PostMapping("/api/db/match/all")
    public Map<String, Object> matchAll(@RequestParam(defaultValue = "500") int limit) {
        return matchSvc.matchAll(limit);
    }

    // -------------------------
    // Helpers
    // -------------------------
    private static String str(Map<String, Object> body, String... keys) {
        for (String k : keys) {
            Object v = body.get(k);
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isEmpty()) return s;
        }
        return null;
    }

    private static BigDecimal dec(Map<String, Object> body, String... keys) {
        for (String k : keys) {
            Object v = body.get(k);
            if (v == null) continue;
            try {
                if (v instanceof BigDecimal bd) return bd;
                if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
                String s = String.valueOf(v).trim();
                if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
                return new BigDecimal(s.replace(",", "."));
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }
}