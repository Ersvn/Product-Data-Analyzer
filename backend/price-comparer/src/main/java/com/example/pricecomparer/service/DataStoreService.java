package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.File;
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
    private final AtomicReference<String> lastCompanySource = new AtomicReference<>(null);

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

            // Enterprise: if companyPath is a file: path and missing, seed it from classpath mock
            ensureCompanyFileIfMissing(companyPath);

            List<Map<String, Object>> rawMarket = readJsonArrayOrWrapped(effectiveMarketPath);
            List<Map<String, Object>> rawCompany = readJsonArrayOrWrapped(companyPath);

            List<Product> m = normalizeAll(rawMarket);
            List<Product> c = normalizeAll(rawCompany);

            m = m.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList();
            c = c.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList();

            // Remember where company data came from (needed for persist)
            lastCompanySource.set(companyPath);

            // Defaults (backwards compatible)
            for (Product p : c) {
                if (p.priceMode == null) p.priceMode = PriceMode.AUTO;
            }

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

    /* =========================================================
       ENTERPRISE BOOT FIX: seed missing company file
       ========================================================= */

    private void ensureCompanyFileIfMissing(String companyPath) {
        try {
            if (companyPath == null || companyPath.isBlank()) return;

            // Only seed writable file paths
            if (!companyPath.startsWith("file:")) return;

            Resource r = resourceLoader.getResource(companyPath);
            if (r.exists()) return;

            // Seed from classpath mock
            Resource seed = resourceLoader.getResource("classpath:data/company.mock.json");
            if (!seed.exists()) return;

            File target = r.getFile();
            File parent = target.getParentFile();
            if (parent != null) parent.mkdirs();

            Object root = om.readValue(seed.getInputStream(), Object.class);
            om.writerWithDefaultPrettyPrinter().writeValue(target, root);

            System.out.printf("[DATA] seeded missing company file from classpath: %s%n", target.getAbsolutePath());
        } catch (Exception e) {
            // Do not crash app boot because of seeding attempt
            System.out.printf("[DATA] seed company file skipped: %s%n", e.getMessage());
        }
    }

    /* =========================================================
       PERSIST (company products)
       ========================================================= */

    public synchronized Map<String, Object> persistCompany() {
        String source = lastCompanySource.get();
        if (source == null || source.isBlank()) {
            return Map.of("ok", false, "reason", "companyPath not set");
        }

        try {
            boolean isClasspath = source.startsWith("classpath:");
            if (isClasspath) {
                return Map.of(
                        "ok", false,
                        "reason", "companyPath is classpath (read-only)",
                        "companyPath", source,
                        "hint", "set app.data.companyPath to a writable path, e.g. file:./data/company.products.json"
                );
            }

            Resource r = resourceLoader.getResource(source);

            File file = r.getFile();
            File parent = file.getParentFile();
            if (parent != null) parent.mkdirs();

            om.writerWithDefaultPrettyPrinter().writeValue(file, companyProducts.get());

            return Map.of(
                    "ok", true,
                    "writtenTo", file.getAbsolutePath(),
                    "count", companyProducts.get().size()
            );
        } catch (Exception e) {
            return Map.of(
                    "ok", false,
                    "reason", e.getMessage(),
                    "companyPath", source
            );
        }
    }

    /* =========================================================
       PRICING ENGINE MVP (in-memory)
       ========================================================= */

    public Product getCompanyById(long id) {
        for (Product p : companyProducts.get()) {
            if (p != null && p.id == id) return p;
        }
        return null;
    }

    public Product getCompanyByEan(String ean) {
        if (ean == null || ean.isBlank()) return null;
        return companyByEan.get().get(ean);
    }

    public Product setManualPrice(long productId, double manualPrice) {
        if (manualPrice <= 0) throw new IllegalArgumentException("manualPrice must be > 0");
        Product p = requireCompanyProduct(productId);
        p.manualPrice = manualPrice;
        p.priceMode = PriceMode.MANUAL;
        p.lastUpdated = Instant.now().toString();
        return p;
    }

    public Product setPriceMode(long productId, PriceMode mode) {
        if (mode == null) mode = PriceMode.AUTO;
        Product p = requireCompanyProduct(productId);
        p.priceMode = mode;
        p.lastUpdated = Instant.now().toString();
        return p;
    }

    public Product recomputeRecommendedPrice(long productId) {
        Product p = requireCompanyProduct(productId);
        Double median = estimateMarketMedianFor(p);
        if (median == null || median <= 0) {
            p.recommendedPrice = null;
            return p;
        }

        double undercut = median * 0.98; // MVP default: -2%
        double rounded = roundToPoint90(undercut);

        p.recommendedPrice = rounded;
        p.lastUpdated = Instant.now().toString();
        return p;
    }

    public Double getEffectivePrice(Product p) {
        if (p == null) return null;
        PriceMode mode = (p.priceMode == null) ? PriceMode.AUTO : p.priceMode;
        if (mode == PriceMode.MANUAL && p.manualPrice != null) return p.manualPrice;
        return p.recommendedPrice;
    }

    private Product requireCompanyProduct(long id) {
        Product p = getCompanyById(id);
        if (p == null) throw new NoSuchElementException("Company product not found: " + id);
        if (p.priceMode == null) p.priceMode = PriceMode.AUTO;
        return p;
    }

    /**
     * MVP "median-ish":
     * - Prefer market.priceMin/priceMax average when available
     * - Else use market.price when present (>0)
     */
    private Double estimateMarketMedianFor(Product companyProduct) {
        if (companyProduct == null || companyProduct.ean == null || companyProduct.ean.isBlank()) return null;

        Product m = marketByEan.get().get(companyProduct.ean);
        if (m == null) return null;

        if (m.priceMin != null && m.priceMax != null && m.priceMin > 0 && m.priceMax > 0) {
            return (m.priceMin + m.priceMax) / 2.0;
        }
        if (m.priceMin != null && m.priceMin > 0) return m.priceMin;
        if (m.priceMax != null && m.priceMax > 0) return m.priceMax;
        if (m.price > 0) return m.price;

        return null;
    }

    /**
     * Rounds to price ending with .90 (e.g., 199.90, 200.90).
     * Always rounds UP to the next *.90 if needed.
     */
    private double roundToPoint90(double v) {
        if (v <= 0) return 0;

        double floor = Math.floor(v);
        double candidate = floor + 0.90;

        if (candidate + 1e-9 < v) {
            candidate = (floor + 1.0) + 0.90;
        }

        if (candidate < 0.90) candidate = 0.90;
        return Math.round(candidate * 100.0) / 100.0;
    }

    /* =========================================================
       Existing loader/normalizer
       ========================================================= */

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

        out.name = safeText(firstNonBlank(p, "name", "title", "productName"));
        if (out.name.isBlank()) out.name = "Unknown";

        out.brand = safeText(firstNonBlank(p, "brand", "manufacturer", "vendor", "Brand"));
        out.category = safeText(firstNonBlank(p, "category", "Category", "cat"));
        out.store = safeText(firstNonBlank(p, "store", "merchant"));
        out.url = safeText(firstNonBlank(p, "url", "link"));

        out.imageUrl = safeText(firstNonBlank(p,
                "imageUrl",
                "image_url",
                "image",
                "thumb",
                "thumbnail",
                "lowPic",
                "LowPic",
                "smallImage",
                "SmallImage"
        ));

        Object priceObj = p.get("price");
        if (priceObj instanceof Map<?, ?> priceMap) {
            Object v = ((Map<String, Object>) priceMap).get("value");
            out.price = toDouble(v, 0);
        } else {
            out.price = toDouble(priceObj, 0);
        }

        out.ean = safeText(normalizeString(firstString(p, "ean", "gtin", "ean13")));

        // optional enrichment fields
        out.priceMin = toNullableDouble(p.get("priceMin"));
        out.priceMax = toNullableDouble(p.get("priceMax"));
        out.ourPrice = toNullableDouble(p.get("ourPrice"));
        out.offersCount = toNullableInt(p.get("offersCount"));
        out.lastUpdated = safeText(firstNonBlank(p, "lastUpdated"));

        // Pricing fields (optional, backwards compatible)
        out.manualPrice = toNullableDouble(p.get("manualPrice"));
        out.recommendedPrice = toNullableDouble(p.get("recommendedPrice"));

        Object pm = p.get("priceMode");
        if (pm != null) {
            try {
                out.priceMode = PriceMode.valueOf(String.valueOf(pm).trim().toUpperCase(Locale.ROOT));
            } catch (Exception ignored) {
                out.priceMode = PriceMode.AUTO;
            }
        } else {
            out.priceMode = PriceMode.AUTO;
        }

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

    private String safeText(String s) {
        return s == null ? "" : s;
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
