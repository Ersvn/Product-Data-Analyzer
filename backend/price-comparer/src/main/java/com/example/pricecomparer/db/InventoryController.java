package com.example.pricecomparer.db;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
public class InventoryController {

    private final JdbcTemplate jdbc;
    private final DbPricingService pricingSvc;
    private final DbSeedService seedSvc;

    public InventoryController(JdbcTemplate jdbc, DbPricingService pricingSvc, DbSeedService seedSvc) {
        this.jdbc = jdbc;
        this.pricingSvc = pricingSvc;
        this.seedSvc = seedSvc;
    }

    @GetMapping("/api/db/company-listings")
    public Map<String, Object> listCompanyListings(
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "0") long afterId,
            @RequestParam(required = false) String q
    ) {
        limit = DbRequestParsers.clamp(limit, 1, 500);

        String query = DbRequestParsers.normalizeSearch(q);
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
                  last_updated
                from company_listings
                where id > ?
                order by id asc
                limit ?
            """, afterId, limit);
        } else {
            String like = "%" + query.toLowerCase(Locale.ROOT) + "%";
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
        String priceMode = DbRequestParsers.str(body, "priceMode", "price_mode");
        BigDecimal manualPrice = DbRequestParsers.dec(body, "manualPrice", "manual_price");
        BigDecimal ourPrice = DbRequestParsers.dec(body, "ourPrice", "our_price");
        BigDecimal costPrice = DbRequestParsers.dec(body, "costPrice", "cost_price");

        if (priceMode != null && !priceMode.isBlank()) {
            String pm = priceMode.trim().toUpperCase(Locale.ROOT);
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

        boolean clearManual = "AUTO".equals(priceMode)
                && !body.containsKey("manualPrice")
                && !body.containsKey("manual_price");

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
              last_updated
            from company_listings
            where id = ?
        """, id);

        return ResponseEntity.ok(Map.of("ok", true, "item", item));
    }

    @PostMapping("/api/db/company-listings/{id}/apply-auto")
    public Map<String, Object> applyAuto(@PathVariable long id) {
        return pricingSvc.applyAutoByCompanyListingId(id);
    }

    @PostMapping("/api/db/company-listings/recompute-all-auto")
    public Map<String, Object> recomputeAllAuto() {
        return pricingSvc.recomputeAllAuto();
    }

    @GetMapping("/api/db/product-view")
    public Map<String, Object> productView(@RequestParam String ean) {
        return pricingSvc.productViewByEan(ean);
    }

    @GetMapping("/api/db/product-view/company")
    public Map<String, Object> productViewByCompany(@RequestParam long companyId) {
        return pricingSvc.productViewByCompanyId(companyId);
    }

    @PostMapping("/api/db/company-listings/seed-from-scraped")
    public Map<String, Object> seedFromScraped(
            @RequestParam(defaultValue = "50") int percent,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "") String siteName
    ) {
        return seedSvc.seedFromScraped(percent, limit, siteName);
    }
}