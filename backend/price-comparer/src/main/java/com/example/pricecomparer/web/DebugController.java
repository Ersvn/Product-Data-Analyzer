package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.stream.Collectors;

@RestController
public class DebugController {

    private final DataStoreService store;

    public DebugController(DataStoreService store) {
        this.store = store;
    }

    @GetMapping("/api/debug/ean-overlap")
    public Map<String, Object> eanOverlap(@RequestParam(defaultValue = "30") int limit) {
        List<Product> company = store.getCompanyProducts();
        List<Product> market = store.getMarketProducts();

        Set<String> companyEans = company.stream()
                .filter(Objects::nonNull)
                .map(p -> p.ean)
                .filter(e -> e != null && !e.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));

        Set<String> marketEans = market.stream()
                .filter(Objects::nonNull)
                .map(p -> p.ean)
                .filter(e -> e != null && !e.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));

        Set<String> overlap = new LinkedHashSet<>(companyEans);
        overlap.retainAll(marketEans);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("companyCount", company.size());
        res.put("marketCount", market.size());
        res.put("companyUniqueEans", companyEans.size());
        res.put("marketUniqueEans", marketEans.size());
        res.put("overlapUniqueEans", Math.min(limit, overlap.size()));
        res.put("overlapSample", overlap.stream().limit(limit).toList());
        res.put("companySample", companyEans.stream().limit(limit).toList());
        res.put("marketSample", marketEans.stream().limit(limit).toList());
        return res;
    }

    @GetMapping("/api/debug/overview-stats")
    public Map<String, Object> overviewStats(@RequestParam(defaultValue = "15") int sample) {
        List<Product> company = store.getCompanyProducts();

        long companyCount = company.size();
        long companyWithEan = 0;
        long marketFoundByEan = 0;
        long benchmarkOk = 0;

        List<Map<String, Object>> miss = new ArrayList<>();

        for (Product p : company) {
            if (p == null) continue;
            if (p.ean == null || p.ean.isBlank()) continue;
            companyWithEan++;

            Product m = store.getMarketProductByEan(p.ean);
            boolean marketFound = (m != null);
            if (marketFound) marketFoundByEan++;

            Double bench = store.getMarketBenchmarkPrice(p);
            boolean benchOk = (bench != null && bench > 0);
            if (benchOk) benchmarkOk++;

            if (!marketFound || !benchOk) {
                if (miss.size() < sample) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("companyId", p.id);
                    row.put("ean", p.ean);
                    row.put("marketFound", marketFound);
                    row.put("benchmark", benchOk);

                    if (m != null) {
                        row.put("marketPrice", m.price);
                        row.put("marketPriceMin", m.priceMin);
                        row.put("marketPriceMax", m.priceMax);
                        row.put("marketOffersCount", m.offersCount);
                    }

                    row.put("priceMode", p.getPriceMode().name());
                    row.put("manualPrice", p.manualPrice);
                    row.put("recommendedPrice", p.recommendedPrice);
                    row.put("effectivePrice", store.getOurComparablePrice(p));
                    miss.add(row);
                }
            }
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("companyCount", companyCount);
        res.put("companyWithEan", companyWithEan);
        res.put("marketFoundByEan", marketFoundByEan);
        res.put("benchmarkOk", benchmarkOk);
        res.put("benchmarkMissSample", miss);
        return res;
    }

    @GetMapping("/api/debug/market-price-signal")
    public Map<String, Object> marketPriceSignal() {
        List<Product> market = store.getMarketProducts();

        long withAny = 0;
        long withMin = 0;
        long withMax = 0;
        long withPrice = 0;

        for (Product m : market) {
            if (m == null) continue;

            boolean any = false;

            if (m.priceMin != null && m.priceMin > 0) { withMin++; any = true; }
            if (m.priceMax != null && m.priceMax > 0) { withMax++; any = true; }
            if (m.price > 0) { withPrice++; any = true; }

            if (any) withAny++;
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("marketCount", market.size());
        res.put("withAnyPriceSignal", withAny);
        res.put("withPriceMin", withMin);
        res.put("withPriceMax", withMax);
        res.put("withPriceField", withPrice);
        return res;
    }
}
