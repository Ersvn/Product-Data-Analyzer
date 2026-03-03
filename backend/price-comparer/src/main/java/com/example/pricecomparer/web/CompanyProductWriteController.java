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

    private ResponseEntity<?> notFoundId(long id) {
        return ResponseEntity.status(404).body(Map.of("ok", false, "error", "Company product not found: " + id));
    }

    private ResponseEntity<?> notFoundEan(String ean) {
        return ResponseEntity.status(404).body(Map.of("ok", false, "error", "Company product not found for ean: " + ean));
    }

    private Map<String, Object> pricingResponse(Product p, Map<String, Object> persisted) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);

        res.put("priceMode", p.getPriceMode().name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);

        Double ourComparable = store.getOurComparablePrice(p);
        res.put("effectivePrice", ourComparable);
        res.put("lastUpdated", p.lastUpdated);

        // Market snapshot
        Product m = store.getMarketProductByEan(p.ean);
        res.put("marketFound", m != null);

        if (m != null) {
            res.put("marketPriceMin", m.priceMin);
            res.put("marketPriceMax", m.priceMax);

            Double bench = store.getMarketBenchmarkPrice(p);
            res.put("marketBenchmarkPrice", bench);
            res.put("marketPrice", bench);

            res.put("competitorCount", m.offersCount);
            res.put("marketLastUpdated", m.lastUpdated);

            if (bench != null && bench > 0 && ourComparable != null) {
                double gapKr = ourComparable - bench;
                res.put("gapKr", gapKr);
                res.put("gapPct", gapKr / bench);
            }
        }

        if (persisted != null) res.put("persist", persisted);
        return res;
    }


    @GetMapping("/{id}/pricing")
    public ResponseEntity<?> pricing(
            @PathVariable long id,
            @RequestParam(defaultValue = "true") boolean recompute
    ) {
        Product p = store.getCompanyById(id);
        if (p == null) return notFoundId(id);

        if (recompute) {
            store.recomputeRecommendedPrice(id);
            p = store.getCompanyById(id);
        }

        return ResponseEntity.ok(pricingResponse(p, null));
    }

    @PutMapping("/{id}/pricing/manual")
    public ResponseEntity<?> setManual(
            @PathVariable long id,
            @RequestBody ManualPriceRequest req,
            HttpServletRequest http
    ) {
        if (req == null || req.manualPrice == null || req.manualPrice <= 0) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "manualPrice must be > 0"));
        }

        Product before = store.getCompanyById(id);
        if (before == null) return notFoundId(id);

        Product p = store.setManualPrice(id, req.manualPrice);
        if (p == null) return notFoundId(id);

        // Keep recommended up to date for UI (even if MANUAL wins)
        store.recomputeRecommendedPrice(id);
        p = store.getCompanyById(id);

        Map<String, Object> persisted = store.persistCompany();

        history.append("SET_MANUAL", before, p);
        audit.log(http, actor(), "SET_MANUAL", id, Map.of("manualPrice", req.manualPrice));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

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
        if (before == null) return notFoundId(id);

        PriceMode mode = req.priceMode;

        Product p = store.setPriceMode(id, mode);
        if (p == null) return notFoundId(id);

        if (mode == PriceMode.AUTO) {
            store.recomputeRecommendedPrice(id);
        }
        p = store.getCompanyById(id);

        Map<String, Object> persisted = store.persistCompany();

        history.append("SET_MODE", before, p);
        audit.log(http, actor(), "SET_MODE", id, Map.of("priceMode", mode.name()));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    @PostMapping("/{id}/pricing/recompute")
    public ResponseEntity<?> recompute(
            @PathVariable long id,
            HttpServletRequest http
    ) {
        Product before = store.getCompanyById(id);
        if (before == null) return notFoundId(id);

        Product p = store.recomputeRecommendedPrice(id);
        if (p == null) return notFoundId(id);

        Map<String, Object> persisted = store.persistCompany();
        p = store.getCompanyById(id);

        history.append("RECOMPUTE", before, p);
        audit.log(http, actor(), "RECOMPUTE", id, Map.of());

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    @GetMapping("/by-ean/{ean}/pricing")
    public ResponseEntity<?> pricingByEan(
            @PathVariable String ean,
            @RequestParam(defaultValue = "true") boolean recompute
    ) {
        Product p = store.getCompanyProductByEan(ean);
        if (p == null) return notFoundEan(ean);

        if (recompute) {
            store.recomputeRecommendedPrice(p.id);
            p = store.getCompanyById(p.id);
        }

        return ResponseEntity.ok(pricingResponse(p, null));
    }

    @PutMapping("/by-ean/{ean}/pricing/manual")
    public ResponseEntity<?> setManualByEan(
            @PathVariable String ean,
            @RequestBody ManualPriceRequest req,
            HttpServletRequest http
    ) {
        if (req == null || req.manualPrice == null || req.manualPrice <= 0) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "manualPrice must be > 0"));
        }

        Product before = store.getCompanyProductByEan(ean);
        if (before == null) return notFoundEan(ean);

        Product p = store.setManualPrice(before.id, req.manualPrice);
        if (p == null) return notFoundEan(ean);

        store.recomputeRecommendedPrice(before.id);
        p = store.getCompanyById(before.id);

        Map<String, Object> persisted = store.persistCompany();

        history.append("SET_MANUAL", before, p);
        audit.log(http, actor(), "SET_MANUAL", before.id, Map.of("manualPrice", req.manualPrice));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    @PutMapping("/by-ean/{ean}/pricing/mode")
    public ResponseEntity<?> setModeByEan(
            @PathVariable String ean,
            @RequestBody PriceModeRequest req,
            HttpServletRequest http
    ) {
        if (req == null || req.priceMode == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "priceMode is required"));
        }

        Product before = store.getCompanyProductByEan(ean);
        if (before == null) return notFoundEan(ean);

        PriceMode mode = req.priceMode;

        Product p = store.setPriceMode(before.id, mode);
        if (p == null) return notFoundEan(ean);

        if (mode == PriceMode.AUTO) {
            store.recomputeRecommendedPrice(before.id);
        }
        p = store.getCompanyById(before.id);

        Map<String, Object> persisted = store.persistCompany();

        history.append("SET_MODE", before, p);
        audit.log(http, actor(), "SET_MODE", before.id, Map.of("priceMode", mode.name()));

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }

    @PostMapping("/by-ean/{ean}/pricing/recompute")
    public ResponseEntity<?> recomputeByEan(
            @PathVariable String ean,
            HttpServletRequest http
    ) {
        Product before = store.getCompanyProductByEan(ean);
        if (before == null) return notFoundEan(ean);

        Product p = store.recomputeRecommendedPrice(before.id);
        if (p == null) return notFoundEan(ean);

        Map<String, Object> persisted = store.persistCompany();
        p = store.getCompanyById(before.id);

        history.append("RECOMPUTE", before, p);
        audit.log(http, actor(), "RECOMPUTE", before.id, Map.of());

        return ResponseEntity.ok(pricingResponse(p, persisted));
    }
}
