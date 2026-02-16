package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
public class PricingController {

    private final DataStoreService store;

    public PricingController(DataStoreService store) {
        this.store = store;
    }

    @GetMapping("/api/company/products/{id}/pricing")
    public Map<String, Object> pricing(@PathVariable long id,
                                       @RequestParam(defaultValue = "true") boolean recompute) {
        Product cp = store.getCompanyById(id);
        if (cp == null) throw new NoSuchElementException("Company product not found: " + id);

        if (recompute) {
            store.recomputeRecommendedPrice(id);
        }

        Product p = store.getCompanyById(id);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);
        res.put("priceMode", p.getPriceMode().name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("effectivePrice", store.getEffectivePrice(p));
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }

    @PutMapping("/api/company/products/{id}/pricing/manual")
    public Map<String, Object> setManual(@PathVariable long id,
                                         @RequestBody Map<String, Object> body) {
        Object v = body.get("manualPrice");
        if (v == null) throw new IllegalArgumentException("manualPrice is required");

        double manualPrice;
        try {
            manualPrice = Double.parseDouble(String.valueOf(v));
        } catch (Exception e) {
            throw new IllegalArgumentException("manualPrice must be a number");
        }

        Product p = store.setManualPrice(id, manualPrice);
        store.recomputeRecommendedPrice(id);

        // persist (best effort)
        Map<String, Object> persist = store.persistCompany();

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);
        res.put("priceMode", p.getPriceMode().name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("effectivePrice", store.getEffectivePrice(p));
        res.put("lastUpdated", p.lastUpdated);
        res.put("persist", persist);
        return res;
    }

    @PutMapping("/api/company/products/{id}/pricing/mode")
    public Map<String, Object> setMode(@PathVariable long id,
                                       @RequestBody Map<String, Object> body) {
        Object v = body.get("priceMode");
        if (v == null) throw new IllegalArgumentException("priceMode is required");

        String s = String.valueOf(v).trim().toUpperCase(Locale.ROOT);

        PriceMode mode;
        try {
            mode = PriceMode.valueOf(s);
        } catch (Exception e) {
            throw new IllegalArgumentException("priceMode must be AUTO or MANUAL");
        }

        Product p = store.setPriceMode(id, mode);

        if (mode == PriceMode.AUTO) {
            store.recomputeRecommendedPrice(id);
            p = store.getCompanyById(id);
        }

        // persist (best effort)
        Map<String, Object> persist = store.persistCompany();

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);
        res.put("priceMode", p.getPriceMode().name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("effectivePrice", store.getEffectivePrice(p));
        res.put("lastUpdated", p.lastUpdated);
        res.put("persist", persist);
        return res;
    }

    @PostMapping("/api/company/products/{id}/pricing/recompute")
    public Map<String, Object> recompute(@PathVariable long id) {
        Product p = store.recomputeRecommendedPrice(id);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("productId", p.id);
        res.put("ean", p.ean);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("effectivePrice", store.getEffectivePrice(p));
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }
}
