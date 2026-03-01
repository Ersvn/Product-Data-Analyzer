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

    @Value("${enrichment.enabled:false}")
    private boolean enrichmentEnabled;

    @Value("${app.data.useEnrichedMarket:false}")
    private boolean useEnrichedMarket;

    /**
     * Storage mode for the application.
     * - FILES: legacy JSON (DataStoreService)
     * - DB:    database-backed endpoints under /api/db
     */
    @Value("${app.storage:FILES}")
    private String storage;

    public ProductController(DataStoreService store, ProductQueryService queryService) {
        this.store = store;
        this.queryService = queryService;
    }

    @PostConstruct
    public void init() {
        if (isDbMode()) {
            // In DB mode we don't load JSON files at startup.
            return;
        }
        store.loadAll(marketPath, companyPath, enrichedMarketPath, useEnrichedMarket);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "ok", true,
                "storage", storage,
                "lastLoadedAt", store.getLastLoadedAt(),
                "market", store.market().size(),
                "company", store.company().size(),
                "useEnrichedMarket", useEnrichedMarket,
                "enrichmentEnabled", enrichmentEnabled
        );
    }

    @PostMapping("/api/reload")
    public Map<String, Object> reload() {
        if (isDbMode()) {
            return Map.of(
                    "ok", false,
                    "storage", storage,
                    "error", "DB_MODE",
                    "message", "Reload is disabled when app.storage=DB. Use /api/db endpoints instead."
            );
        }
        store.loadAll(marketPath, companyPath, enrichedMarketPath, useEnrichedMarket);
        return Map.of(
                "ok", true,
                "storage", storage,
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
        if (isDbMode()) return emptyResult();
        return queryService.query(store.market(), query);
    }

    @GetMapping("/api/products/{id}")
    public Product marketById(@PathVariable String id) {
        if (isDbMode()) throw new NoSuchElementException("DB mode: use /api/db endpoints");
        return store.market().stream()
                .filter(p -> String.valueOf(p.id).equals(id))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Product not found"));
    }

    @GetMapping("/api/company/products")
    public QueryResult<Product> company(@RequestParam Map<String, String> query) {
        if (isDbMode()) return emptyResult();
        return queryService.query(store.company(), query);
    }

    @GetMapping("/api/company/products/{id}")
    public Product companyById(@PathVariable String id) {
        if (isDbMode()) throw new NoSuchElementException("DB mode: use /api/db endpoints");
        return store.company().stream()
                .filter(p -> String.valueOf(p.id).equals(id))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Company product not found"));
    }

    @GetMapping("/api/all")
    public QueryResult<Product> all(@RequestParam Map<String, String> query) {
        if (isDbMode()) return emptyResult();
        String source = String.valueOf(query.getOrDefault("source", "market"));
        var products = source.equals("company") ? store.company() : store.market();
        return queryService.query(products, query);
    }

    private boolean isDbMode() {
        return storage != null && storage.trim().equalsIgnoreCase("DB");
    }

    private static QueryResult<Product> emptyResult() {
        QueryResult<Product> out = new QueryResult<>();
        out.data = java.util.List.of();
        QueryResult.Meta meta = new QueryResult.Meta();
        meta.total = 0;
        meta.page = 1;
        meta.limit = 0;
        meta.totalPages = 0;
        out.meta = meta;
        return out;
    }
}