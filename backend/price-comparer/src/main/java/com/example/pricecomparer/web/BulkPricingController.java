package com.example.pricecomparer.web;

import com.example.pricecomparer.service.DataStoreService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/company/products/pricing")
public class BulkPricingController {

    private final DataStoreService store;

    public BulkPricingController(DataStoreService store) {
        this.store = store;
    }

    @PostMapping("/recompute-all")
    public ResponseEntity<?> recomputeAll(
            @RequestParam(defaultValue = "true") boolean persist
    ) {
        long t0 = System.currentTimeMillis();

        DataStoreService.BulkRecomputeStats stats = store.recomputeAllCompanyPrices();

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("recomputed", stats.recomputed());
        res.put("skipped", stats.skipped());
        res.put("errors", stats.errors());

        if (persist) {
            res.put("persist", store.persistCompany());
        }

        res.put("tookMs", System.currentTimeMillis() - t0);
        return ResponseEntity.ok(res);
    }
}