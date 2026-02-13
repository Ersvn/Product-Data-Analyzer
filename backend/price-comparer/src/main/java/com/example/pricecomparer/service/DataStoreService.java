package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.Product;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class DataStoreService {

    private final ObjectMapper om = new ObjectMapper();
    private final ResourceLoader resourceLoader;

    private final AtomicReference<List<Product>> marketProducts = new AtomicReference<>(List.of());
    private final AtomicReference<List<Product>> companyProducts = new AtomicReference<>(List.of());
    private final AtomicReference<Map<String, Product>> marketByEan = new AtomicReference<>(Map.of());
    private final AtomicReference<Map<String, Product>> companyByEan = new AtomicReference<>(Map.of());
    private final AtomicReference<String> lastLoadedAt = new AtomicReference<>(null);

    public DataStoreService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    public String getLastLoadedAt() { return lastLoadedAt.get(); }
    public List<Product> market() { return marketProducts.get(); }
    public List<Product> company() { return companyProducts.get(); }
    public Map<String, Product> marketIndex() { return marketByEan.get(); }
    public Map<String, Product> companyIndex() { return companyByEan.get(); }

    /**
     * @param useEnrichedMarket true => använd enrichedMarketPath om filen finns
     *                         false => använd alltid marketPath (mock)
     */
    public synchronized void loadAll(String marketPath,
                                     String companyPath,
                                     String enrichedMarketPath,
                                     boolean useEnrichedMarket) {
        try {
            String effectiveMarketPath = pickMarketPath(marketPath, enrichedMarketPath, useEnrichedMarket);

            List<Map<String, Object>> rawMarket = readJsonArrayOrWrapped(effectiveMarketPath);
            List<Map<String, Object>> rawCompany = readJsonArrayOrWrapped(companyPath);

            List<Product> m = normalizeAll(rawMarket);
            List<Product> c = normalizeAll(rawCompany);

            m = m.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList();
            c = c.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList();

            marketProducts.set(m);
            companyProducts.set(c);

            marketByEan.set(buildIndex(m));
            companyByEan.set(buildIndex(c));

            lastLoadedAt.set(Instant.now().toString());
            System.out.printf("[DATA] loaded market=%d company=%d at %s (marketSource=%s)%n",
                    m.size(), c.size(), lastLoadedAt.get(), effectiveMarketPath);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load JSON: " + e.getMessage(), e);
        }
    }

    private String pickMarketPath(String marketPath, String enrichedMarketPath, boolean useEnrichedMarket) {
        if (!useEnrichedMarket) return marketPath;
        if (enrichedMarketPath == null || enrichedMarketPath.isBlank()) return marketPath;

        try {
            Resource r = resourceLoader.getResource(enrichedMarketPath);
            if (r.exists()) return enrichedMarketPath;
        } catch (Exception ignored) {}

        return marketPath;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readJsonArrayOrWrapped(String location) throws Exception {
        Resource r = resourceLoader.getResource(location);
        Object root = om.readValue(r.getInputStream(), Object.class);

        if (root instanceof List<?> list) return (List<Map<String, Object>>) (List<?>) list;

        if (root instanceof Map<?, ?> map) {
            Object products = ((Map<String, Object>) map).get("products");
            if (products instanceof List<?> list) return (List<Map<String, Object>>) (List<?>) list;
            Object data = ((Map<String, Object>) map).get("data");
            if (data instanceof List<?> list) return (List<Map<String, Object>>) (List<?>) list;
        }
        return List.of();
    }

    private List<Product> normalizeAll(List<Map<String, Object>> raw) {
        List<Product> out = new ArrayList<>();
        long idx = 0;
        for (Map<String, Object> p : raw) out.add(normalizeProduct(p, ++idx));
        return out;
    }

    @SuppressWarnings("unchecked")
    private Product normalizeProduct(Map<String, Object> p, long idx) {
        Product out = new Product();

        out.id = toLong(p.getOrDefault("id", idx), idx);

        out.name = firstNonBlank(p, "name", "title", "productName");
        if (out.name == null || out.name.isBlank()) out.name = "Unknown";

        out.brand = firstNonBlank(p, "brand", "manufacturer", "vendor", "Brand");
        out.category = firstNonBlank(p, "category", "Category", "cat");
        out.store = firstNonBlank(p, "store", "merchant");
        out.url = firstNonBlank(p, "url", "link");

        out.imageUrl = firstNonBlank(p,
                "imageUrl",
                "image_url",
                "image",
                "thumb",
                "thumbnail",
                "lowPic",
                "LowPic",
                "smallImage",
                "SmallImage"
        );

        Object priceObj = p.get("price");
        if (priceObj instanceof Map<?, ?> priceMap) {
            Object v = ((Map<String, Object>) priceMap).get("value");
            out.price = toDouble(v, 0);
        } else {
            out.price = toDouble(priceObj, 0);
        }

        out.ean = normalizeString(firstString(p, "ean", "gtin", "ean13"));

        // optional enrichment fields
        out.priceMin = toNullableDouble(p.get("priceMin"));
        out.priceMax = toNullableDouble(p.get("priceMax"));
        out.ourPrice = toNullableDouble(p.get("ourPrice"));
        out.offersCount = toNullableInt(p.get("offersCount"));
        out.lastUpdated = firstNonBlank(p, "lastUpdated");

        return out;
    }

    private Map<String, Product> buildIndex(List<Product> arr) {
        Map<String, Product> m = new HashMap<>();
        for (Product p : arr) {
            if (p != null && p.ean != null && !p.ean.isBlank()) m.put(String.valueOf(p.ean), p);
        }
        return Collections.unmodifiableMap(m);
    }

    private String firstString(Map<String, Object> p, String... keys) {
        for (String k : keys) {
            Object v = p.get(k);
            if (v != null) return String.valueOf(v);
        }
        return "";
    }

    private String firstNonBlank(Map<String, Object> p, String... keys) {
        for (String k : keys) {
            Object v = p.get(k);
            if (v == null) continue;
            String s = normalizeString(String.valueOf(v));
            if (s != null && !s.isBlank()) return s;
        }
        return "";
    }

    private String normalizeString(String s) {
        if (s == null) return "";
        String x = s.trim();
        if (x.equalsIgnoreCase("null")) return "";
        return x;
    }

    private long toLong(Object v, long fallback) {
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return fallback; }
    }

    private double toDouble(Object v, double fallback) {
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return fallback; }
    }

    private Double toNullableDouble(Object v) {
        if (v == null) return null;
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private Integer toNullableInt(Object v) {
        if (v == null) return null;
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return null; }
    }
}
