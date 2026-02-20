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
                double marketPrice = pickMarketBenchmark(cp, mp);
                double companyPrice = pickCompanyComparable(cp);

                double diff = companyPrice - marketPrice;

                matched.add(new CompareResponse.Matched(ean, mp, cp, diff));
            } else if (mp != null) {
                onlyInMarket.add(mp);
            } else if (cp != null) {
                onlyInCompany.add(cp);
            }
        }

        // Sortera “värst (dyrast)” högst först
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

    private double pickMarketBenchmark(Product cp, Product mp) {
        // Primary: use the single source of truth benchmark logic (median/min/max/price)
        Double bench = store.getMarketBenchmarkPrice(cp);
        if (bench != null && bench > 0) return bench;

        // Secondary fallback (should rarely happen if indices are correct)
        if (mp == null) return 0.0;
        Double min = mp.priceMin;
        Double max = mp.priceMax;

        if (min != null && max != null && min > 0 && max > 0) return (min + max) / 2.0;
        if (min != null && min > 0) return min;
        if (max != null && max > 0) return max;
        if (mp.price > 0) return mp.price;

        return 0.0;
    }

    private double pickCompanyComparable(Product cp) {
        Double our = store.getOurComparablePrice(cp);
        if (our != null && our > 0) return our;
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
