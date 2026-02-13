package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.domain.QueryResult;
import com.example.pricecomparer.service.DataStoreService;
import com.example.pricecomparer.service.ProductQueryService;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

@RestController
public class ProductController {

    private final DataStoreService store;
    private final ProductQueryService queryService;

    @Value("${app.data.marketPath}")
    private String marketPath;

    @Value("${app.data.enrichedMarketPath:}")
    private String enrichedMarketPath;

    @Value("${app.data.companyPath}")
    private String companyPath;

    // enrichment får vara enabled utan att vi automatiskt använder enriched som market
    @Value("${enrichment.enabled:false}")
    private boolean enrichmentEnabled;

    // ✅ ny flagga som styr vilken market-källa som används
    @Value("${app.data.useEnrichedMarket:false}")
    private boolean useEnrichedMarket;

    public ProductController(DataStoreService store, ProductQueryService queryService) {
        this.store = store;
        this.queryService = queryService;
    }

    @PostConstruct
    public void init() {
        store.loadAll(marketPath, companyPath, enrichedMarketPath, useEnrichedMarket);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "ok", true,
                "lastLoadedAt", store.getLastLoadedAt(),
                "market", store.market().size(),
                "company", store.company().size(),
                "useEnrichedMarket", useEnrichedMarket,
                "enrichmentEnabled", enrichmentEnabled
        );
    }

    @PostMapping("/api/reload")
    public Map<String, Object> reload() {
        store.loadAll(marketPath, companyPath, enrichedMarketPath, useEnrichedMarket);
        return Map.of(
                "ok", true,
                "lastLoadedAt", store.getLastLoadedAt(),
                "market", store.market().size(),
                "company", store.company().size(),
                "useEnrichedMarket", useEnrichedMarket,
                "enrichmentEnabled", enrichmentEnabled,
                "marketPath", marketPath,
                "companyPath", companyPath,
                "enrichedMarketPath", enrichedMarketPath
        );
    }

    @GetMapping("/api/products")
    public QueryResult<Product> market(@RequestParam Map<String, String> query) {
        return queryService.query(store.market(), query);
    }

    @GetMapping("/api/products/{id}")
    public Product marketById(@PathVariable String id) {
        return store.market().stream()
                .filter(p -> String.valueOf(p.id).equals(id))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Product not found"));
    }

    @GetMapping("/api/company/products")
    public QueryResult<Product> company(@RequestParam Map<String, String> query) {
        return queryService.query(store.company(), query);
    }

    @GetMapping("/api/all")
    public QueryResult<Product> all(@RequestParam Map<String, String> query) {
        String source = String.valueOf(query.getOrDefault("source", "market"));
        var products = source.equals("company") ? store.company() : store.market();
        return queryService.query(products, query);
    }
}
