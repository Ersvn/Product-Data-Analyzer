package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class DebugPricingController {

    private final DataStoreService store;

    public DebugPricingController(DataStoreService store) {
        this.store = store;
    }

    @GetMapping("/api/debug/pricing")
    public Map<String, Object> pricing(@RequestParam String ean) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("ean", ean);

        Product c = store.getCompanyProductByEan(ean);
        Product m = store.getMarketProductByEan(ean);

        res.put("companyFound", c != null);
        res.put("marketFound", m != null);

        Double benchmark = (c == null) ? null : store.getMarketBenchmarkPrice(c);
        Double ourComparable = (c == null) ? null : store.getOurComparablePrice(c);

        res.put("benchmarkPrice", benchmark);
        res.put("ourComparablePrice", ourComparable);

        if (benchmark != null && benchmark > 0 && ourComparable != null && ourComparable > 0) {
            double gapKr = ourComparable - benchmark;
            double gapPct = gapKr / benchmark;
            res.put("gapKr", gapKr);
            res.put("gapPct", gapPct);
        } else {
            res.put("gapKr", null);
            res.put("gapPct", null);
        }

        // --- company view ---
        if (c != null) {
            Map<String, Object> cv = new LinkedHashMap<>();
            cv.put("id", c.id);
            cv.put("name", c.name);
            cv.put("brand", c.brand);
            cv.put("category", c.category);
            cv.put("ean", c.ean);
            cv.put("priceMode", c.getPriceMode().name());
            cv.put("manualPrice", c.manualPrice);
            cv.put("recommendedPrice", c.recommendedPrice);
            cv.put("ourPrice", c.ourPrice);
            cv.put("price", c.price);
            cv.put("lastUpdated", c.lastUpdated);
            res.put("company", cv);
        } else {
            res.put("company", null);
        }

        // --- market view ---
        if (m != null) {
            Map<String, Object> mv = new LinkedHashMap<>();
            mv.put("id", m.id);
            mv.put("name", m.name);
            mv.put("brand", m.brand);
            mv.put("category", m.category);
            mv.put("ean", m.ean);
            mv.put("priceMin", m.priceMin);
            mv.put("priceMax", m.priceMax);
            mv.put("price", m.price);
            mv.put("offersCount", m.offersCount);
            mv.put("lastUpdated", m.lastUpdated);
            res.put("market", mv);
        } else {
            res.put("market", null);
        }

        return res;
    }
}
