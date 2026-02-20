package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class DashboardActionsController {

    private final DataStoreService store;

    public DashboardActionsController(DataStoreService store) {
        this.store = store;
    }

    /**
     * POST /api/dashboard/actions/mode
     * body: { "id": 123, "mode": "AUTO" | "MANUAL" }
     */
    @PostMapping("/api/dashboard/actions/mode")
    public Map<String, Object> setMode(@RequestBody ModeRequest req) {
        long id = req == null ? 0 : req.id;
        String modeRaw = req == null ? null : req.mode;

        PriceMode mode;
        try {
            mode = (modeRaw == null || modeRaw.isBlank())
                    ? PriceMode.AUTO
                    : PriceMode.valueOf(modeRaw.trim().toUpperCase());
        } catch (Exception e) {
            mode = PriceMode.AUTO;
        }

        Product p = store.setPriceMode(id, mode);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("id", p.id);
        res.put("mode", p.priceMode == null ? null : p.priceMode.name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }

    /**
     * POST /api/dashboard/actions/manual
     * body: { "id": 123, "manualPrice": 1999.0 }
     */
    @PostMapping("/api/dashboard/actions/manual")
    public Map<String, Object> setManual(@RequestBody ManualPriceRequest req) {
        long id = req == null ? 0 : req.id;
        double price = req == null ? 0 : req.manualPrice;

        Product p = store.setManualPrice(id, price);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("id", p.id);
        res.put("mode", p.priceMode == null ? null : p.priceMode.name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }

    /**
     * POST /api/dashboard/actions/reset
     * body: { "id": 123 }
     */
    @PostMapping("/api/dashboard/actions/reset")
    public Map<String, Object> reset(@RequestBody IdRequest req) {
        long id = req == null ? 0 : req.id;
        Product p = store.resetToAuto(id);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("id", p.id);
        res.put("mode", p.priceMode == null ? null : p.priceMode.name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }

    /**
     * POST /api/dashboard/actions/recompute
     * body: { "id": 123 }
     */
    @PostMapping("/api/dashboard/actions/recompute")
    public Map<String, Object> recompute(@RequestBody IdRequest req) {
        long id = req == null ? 0 : req.id;
        Product p = store.recomputeRecommendedPrice(id);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("id", p.id);
        res.put("mode", p.priceMode == null ? null : p.priceMode.name());
        res.put("manualPrice", p.manualPrice);
        res.put("recommendedPrice", p.recommendedPrice);
        res.put("lastUpdated", p.lastUpdated);
        return res;
    }

    /**
     * POST /api/dashboard/actions/persist-overrides
     */
    @PostMapping("/api/dashboard/actions/persist-overrides")
    public Map<String, Object> persistOverrides() {
        return store.persistOverrides();
    }

    /**
     * POST /api/dashboard/actions/persist-company
     * (valfri; kan vara bra när du vill spara hela company.products.json)
     */
    @PostMapping("/api/dashboard/actions/persist-company")
    public Map<String, Object> persistCompany() {
        return store.persistCompany();
    }

    /* =========================
       Request DTOs
       ========================= */

    public static class IdRequest {
        public long id;
        public IdRequest() {}
    }

    public static class ModeRequest {
        public long id;
        public String mode;
        public ModeRequest() {}
    }

    public static class ManualPriceRequest {
        public long id;
        public double manualPrice;
        public ManualPriceRequest() {}
    }
}
