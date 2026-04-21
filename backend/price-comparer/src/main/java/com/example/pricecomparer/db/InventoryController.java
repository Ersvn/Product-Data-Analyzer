package com.example.pricecomparer.db;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
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
        int clampedLimit = DbRequestParsers.clamp(limit, 1, 500);
        String query = DbRequestParsers.normalizeSearch(q);
        String like = "%" + query.toLowerCase() + "%";

        List<Map<String, Object>> items = query.isBlank()
                ? jdbc.queryForList(baseListSql() + " where c.id > ? order by c.id asc limit ?", afterId, clampedLimit)
                : jdbc.queryForList(baseListSql() + """
                    where c.id > ?
                      and (
                        lower(c.company_sku) like ?
                        or lower(coalesce(c.ean,'')) like ?
                        or lower(coalesce(c.mpn,'')) like ?
                        or lower(coalesce(c.name,'')) like ?
                        or lower(coalesce(c.brand,'')) like ?
                      )
                    order by c.id asc
                    limit ?
                    """, afterId, like, like, like, like, like, clampedLimit);

        long nextAfterId = items.isEmpty() ? afterId : DbValueUtils.longOrNull(items.getLast().get("id"));
        if (nextAfterId == 0L && items.isEmpty()) nextAfterId = afterId;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("limit", clampedLimit);
        out.put("afterId", afterId);
        out.put("nextAfterId", nextAfterId);
        out.put("q", query);
        out.put("items", items);
        return out;
    }

    @PatchMapping("/api/db/company-listings/{id}")
    public ResponseEntity<?> patchCompanyListing(@PathVariable long id, @RequestBody Map<String, Object> body) {
        PriceMode priceMode = PriceMode.parseOrNull(DbRequestParsers.str(body, "priceMode", "price_mode"));
        String rawPriceMode = DbRequestParsers.str(body, "priceMode", "price_mode");
        BigDecimal manualPrice = DbRequestParsers.dec(body, "manualPrice", "manual_price");
        BigDecimal ourPrice = DbRequestParsers.dec(body, "ourPrice", "our_price");
        BigDecimal costPrice = DbRequestParsers.dec(body, "costPrice", "cost_price");

        if (rawPriceMode != null && priceMode == null) {
            return ResponseEntity.badRequest().body(ApiResponses.error("BAD_REQUEST", "priceMode must be AUTO or MANUAL"));
        }
        if (priceMode == PriceMode.MANUAL && manualPrice == null) {
            return ResponseEntity.badRequest().body(ApiResponses.error("BAD_REQUEST", "manualPrice is required when priceMode=MANUAL"));
        }
        if (priceMode == PriceMode.MANUAL && ourPrice == null) {
            ourPrice = manualPrice;
        }

        boolean clearManual = priceMode == PriceMode.AUTO && !body.containsKey("manualPrice") && !body.containsKey("manual_price");
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
            """, priceMode == null ? null : priceMode.name(), manualToPersist, ourPrice, costPrice, id);

        if (updated == 0) {
            return ResponseEntity.status(404).body(ApiResponses.error("NOT_FOUND", "company_listing not found"));
        }

        return ResponseEntity.ok(ApiResponses.ok("item", jdbc.queryForMap(baseListSql() + " where c.id = ?", id)));
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

    private String baseListSql() {
        return """
            select
              %s
            from company_listings c
            """.formatted(DbSql.COMPANY_LISTING_SELECT);
    }
}
