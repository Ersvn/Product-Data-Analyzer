package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.CompareResponse;
import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
public class CompareController {

    private final DataStoreService store;

    public CompareController(DataStoreService store) {
        this.store = store;
    }

    @GetMapping("/api/compare")
    public CompareResponse compare(@RequestParam Map<String, String> query) {
        String q = String.valueOf(query.getOrDefault("q", "")).trim().toLowerCase(Locale.ROOT);

        Map<String, Product> m = store.marketIndex();
        Map<String, Product> c = store.companyIndex();

        Set<String> allEans = new HashSet<>();
        allEans.addAll(m.keySet());
        allEans.addAll(c.keySet());

        List<CompareResponse.Matched> matched = new ArrayList<>();
        List<Product> onlyInMarket = new ArrayList<>();
        List<Product> onlyInCompany = new ArrayList<>();

        for (String ean : allEans) {
            Product mp = m.get(ean);
            Product cp = c.get(ean);

            boolean passesQ = q.isBlank() || anyContains(q,
                    mp == null ? null : mp.name, mp == null ? null : mp.brand, mp == null ? null : mp.category, mp == null ? null : mp.store, ean,
                    cp == null ? null : cp.name, cp == null ? null : cp.brand, cp == null ? null : cp.category, cp == null ? null : cp.store, ean
            );
            if (!passesQ) continue;

            if (mp != null && cp != null) {
                double marketPrice = pickMarketPrice(mp);
                double companyPrice = pickCompanyPrice(cp);

                double diff = companyPrice - marketPrice;

                matched.add(new CompareResponse.Matched(ean, mp, cp, diff));
            } else if (mp != null) {
                onlyInMarket.add(mp);
            } else if (cp != null) {
                onlyInCompany.add(cp);
            }
        }

        // Sortera “värst (dyrast)” högst först (mer logiskt i dashboard)
        matched.sort((a, b) -> Double.compare(b.priceDiff, a.priceDiff));

        CompareResponse out = new CompareResponse();
        out.matched = matched;
        out.onlyInMarket = onlyInMarket;
        out.onlyInCompany = onlyInCompany;

        out.meta = Map.of(
                "lastLoadedAt", store.getLastLoadedAt(),
                "marketTotal", store.market().size(),
                "companyTotal", store.company().size(),
                "matched", matched.size(),
                "onlyInMarket", onlyInMarket.size(),
                "onlyInCompany", onlyInCompany.size()
        );
        return out;
    }

    private double pickMarketPrice(Product mp) {
        // Om enriched har priceMin/priceMax, ta min som “bästa marknadspris”
        if (mp.priceMin != null && mp.priceMin > 0) return mp.priceMin;
        if (mp.price > 0) return mp.price;
        return 0.0;
    }

    private double pickCompanyPrice(Product cp) {
        // Pricing Engine effective price (MANUAL overrides)
        Double eff = cp.getEffectivePrice();
        if (eff != null && eff > 0) return eff;

        // Existing behavior fallback
        if (cp.ourPrice != null && cp.ourPrice > 0) return cp.ourPrice;
        if (cp.price > 0) return cp.price;
        return 0.0;
    }


    private boolean anyContains(String needle, String... vals) {
        for (String v : vals) {
            if (v == null) continue;
            if (v.toLowerCase(Locale.ROOT).contains(needle)) return true;
        }
        return false;
    }
}
