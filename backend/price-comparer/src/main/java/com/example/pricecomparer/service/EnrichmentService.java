package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.service.icecat.IcecatImageService;
import com.example.pricecomparer.service.prices.PricesApiClient;
import com.example.pricecomparer.service.relevance.RelevanceService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

@Service
public class EnrichmentService {

    private final PricesApiClient api;
    private final RelevanceService relevance;
    private final IcecatImageService icecat;
    private final ObjectMapper om = new ObjectMapper();

    @Value("${enrichment.enabled:false}")
    private boolean enabled;

    @Value("${enrichment.maxProductsPerRun:150}")
    private int maxProductsPerRun;

    @Value("${enrichment.ourPriceFactor:0.65}")
    private double ourPriceFactor;

    @Value("${cache.pricesapi.path:./data/cache/pricesapi}")
    private String cachePath;

    public EnrichmentService(PricesApiClient api, RelevanceService relevance, IcecatImageService icecat) {
        this.api = api;
        this.relevance = relevance;
        this.icecat = icecat;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public List<Product> enrich(List<Product> base) {
        if (!enabled) return base;

        ensureDir(cachePath);

        int processed = 0;
        List<Product> out = new ArrayList<>(base.size());

        for (Product p : base) {
            if (p == null || p.ean == null || p.ean.isBlank()) {
                out.add(p);
                continue;
            }

            attachIcecatImage(p);

            if (!relevance.isRelevant(p)) {
                out.add(p);
                continue;
            }

            if (processed >= maxProductsPerRun) {
                out.add(p);
                continue;
            }

            out.add(enrichOneWithPricesApi(p));
            processed++;
        }

        return out;
    }

    private void attachIcecatImage(Product p) {
        try {
            if (p == null) return;
            if (p.imageUrl != null && !p.imageUrl.isBlank()) return;
            if (icecat == null || !icecat.isEnabled()) return;

            String img = icecat.findImageUrlByEan(p.ean);
            if (img != null && !img.isBlank()) {
                p.imageUrl = img;
            }
        } catch (Exception ignored) {}
    }

    private Product enrichOneWithPricesApi(Product p) {
        String ean = normalizeDigits(p.ean);
        if (ean.isBlank()) return p;

        JsonNode search = readCacheIfFresh(ean);
        if (search == null) {
            try {
                search = api.search(ean, 5);
                writeCache(ean, search);
            } catch (Exception ex) {
                return p;
            }
        }

        JsonNode results = search.path("data").path("results");
        int total = search.path("data").path("total").asInt(0);
        System.out.printf("[ENRICH] ean=%s total=%d%n", ean, total);

        if (!results.isArray() || results.size() == 0) {
            return p;
        }

        JsonNode best = results.get(0);
        String productId = best.path("id").asText("");
        String title = best.path("title").asText("");
        if (productId.isBlank()) return p;

        JsonNode offersRoot;
        try {
            offersRoot = api.offers(productId, api.country());
        } catch (Exception ex) {
            return p;
        }

        OfferStats stats = OfferStats.from(offersRoot);

        System.out.printf(
                "[ENRICH] picked id=%s title=%s offers=%d min=%.2f max=%.2f%n",
                productId, title, stats.count, stats.minPrice, stats.maxPrice
        );

        if (!title.isBlank()) p.name = title;

        if (stats.count > 0 && stats.minPrice > 0) {
            p.price = stats.minPrice;
            p.store = stats.minStore;
            p.url = stats.minUrl;

            p.priceMin = stats.minPrice;
            p.priceMax = stats.maxPrice;
            p.offersCount = stats.count;
            p.lastUpdated = Instant.now().toString();
            p.ourPrice = calcOurPrice(stats.minPrice, stats.maxPrice);
        }

        return p;
    }

    private double calcOurPrice(double min, double max) {
        if (min <= 0) return 0;
        if (max <= min) return Math.round(min + 1);

        double v = min + (max - min) * ourPriceFactor;
        v = Math.max(v, min + 1);
        return Math.round(v);
    }

    private static class OfferStats {
        double minPrice = 0;
        double maxPrice = 0;
        int count = 0;
        String minStore = null;
        String minUrl = null;

        static OfferStats from(JsonNode root) {
            OfferStats s = new OfferStats();
            JsonNode offers = root.path("data").path("offers");
            if (!offers.isArray()) return s;

            for (JsonNode o : offers) {
                double price = o.path("price").asDouble(0);
                if (price <= 0) continue;

                s.count++;

                if (s.minPrice == 0 || price < s.minPrice) {
                    s.minPrice = price;
                    s.minStore = o.path("seller").asText(null);
                    s.minUrl = o.path("url").asText(null);
                }
                if (price > s.maxPrice) s.maxPrice = price;
            }
            return s;
        }
    }

    private void ensureDir(String p) {
        try { Files.createDirectories(Path.of(p)); } catch (Exception ignored) {}
    }

    private Path cacheFile(String key) {
        return Path.of(cachePath, key + ".json");
    }

    private JsonNode readCacheIfFresh(String key) {
        try {
            Path f = cacheFile(key);
            if (!Files.exists(f)) return null;

            long ageMs = System.currentTimeMillis() - Files.getLastModifiedTime(f).toMillis();
            long ttlMs = api.cacheTtlHours() * 60L * 60L * 1000L;
            if (ageMs > ttlMs) return null;

            return om.readTree(Files.readString(f));
        } catch (Exception e) {
            return null;
        }
    }

    private void writeCache(String key, JsonNode json) {
        try {
            Files.writeString(
                    cacheFile(key),
                    om.writerWithDefaultPrettyPrinter().writeValueAsString(json)
            );
        } catch (Exception ignored) {}
    }

    private String normalizeDigits(String s) {
        if (s == null) return "";
        return s.replaceAll("\\D", "");
    }
}
