package com.example.pricecomparer.web;

import com.example.pricecomparer.audit.AuditLogService;
import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.history.PriceHistoryAppendService;
import com.example.pricecomparer.service.DataStoreService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/company/products")
public class CompanyProductWriteController {

    private final DataStoreService store;
    private final PriceHistoryAppendService history;
    private final AuditLogService audit;

    public CompanyProductWriteController(DataStoreService store,
                                         PriceHistoryAppendService history,
                                         AuditLogService audit) {
        this.store = store;
        this.history = history;
        this.audit = audit;
    }

    // ---------- DTOs ----------
    public record ManualPriceRequest(Double manualPrice) {}
    public record PriceModeRequest(PriceMode priceMode) {}

    private String actor() {
        var a = SecurityContextHolder.getContext().getAuthentication();
        return (a == null) ? "unknown" : a.getName();
    }

    private Map<String, Object> pricingResponse(Product p, Map<String, Object> persisted) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);
        res.put("priceMode", p.getPriceMode().name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("effectivePrice", store.getEffectivePrice(p));
        res.put("lastUpdated", p.lastUpdated);
        if (persisted != null) res.put("persist", persisted);
        return res;
    }

    private ResponseEntity<?> notFound(long id) {
        return ResponseEntity.status(404).body(Map.of("ok", false, "error", "Company product not found: " + id));
    }

    // ---------- READ pricing ----------
    @GetMapping("/{id}/pricing")
    public ResponseEntity<?> pricing(
            @PathVariable long id,
            @RequestParam(defaultValue = "true") boolean recompute
    ) {
        Product p = store.getCompanyById(id);
        if (p == null) return notFound(id);

        if (recompute) {
            store.recomputeRecommendedPrice(id);
            p = store.getCompanyById(id);
        }

        return ResponseEntity.ok(pricingResponse(p, null));
    }

    // ---------- WRITE manual ----------
    @PutMapping("/{id}/pricing/manual")
    public ResponseEntity<?> setManual(
            @PathVariable long id,
            @RequestBody ManualPriceRequest req,
            HttpServletRequest http
    ) {
        if (req == null || req.manualPrice == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "manualPrice is required"));
        }

        Product before = store.getCompanyById(id);
        if (before == null) return notFound(id);

        Product p = store.setManualPrice(id, req.manualPrice);
        if (p == null) return notFound(id);

        // Håll recommended up to date för UI (även om MANUAL vinner)
        store.recomputeRecommendedPrice(id);
        p = store.getCompanyById(id);

        Map<String, Object> persisted = store.persistCompany();

        // history + audit
        history.append("SET_MANUAL", before, p);
        audit.log(http, actor(), "SET_MANUAL", id, Map.of("manualPrice", req.manualPrice));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    // ---------- WRITE mode ----------
    @PutMapping("/{id}/pricing/mode")
    public ResponseEntity<?> setMode(
            @PathVariable long id,
            @RequestBody PriceModeRequest req,
            HttpServletRequest http
    ) {
        if (req == null || req.priceMode == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "priceMode is required"));
        }

        Product before = store.getCompanyById(id);
        if (before == null) return notFound(id);

        PriceMode mode = req.priceMode;

        Product p = store.setPriceMode(id, mode);
        if (p == null) return notFound(id);

        if (mode == PriceMode.AUTO) {
            store.recomputeRecommendedPrice(id);
            p = store.getCompanyById(id);
        } else {
            p = store.getCompanyById(id);
        }

        Map<String, Object> persisted = store.persistCompany();

        history.append("SET_MODE", before, p);
        audit.log(http, actor(), "SET_MODE", id, Map.of("priceMode", mode.name()));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    // ---------- WRITE recompute ----------
    @PostMapping("/{id}/pricing/recompute")
    public ResponseEntity<?> recompute(
            @PathVariable long id,
            HttpServletRequest http
    ) {
        Product before = store.getCompanyById(id);
        if (before == null) return notFound(id);

        Product p = store.recomputeRecommendedPrice(id);
        if (p == null) return notFound(id);

        Map<String, Object> persisted = store.persistCompany();
        p = store.getCompanyById(id);

        history.append("RECOMPUTE", before, p);
        audit.log(http, actor(), "RECOMPUTE", id, Map.of());

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }
}
