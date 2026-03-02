package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.PriceMode;
import com.example.pricecomparer.domain.Product;
import com.example.pricing.core.MarketSnapshot;
import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingResult;
import com.example.pricing.core.PricingStrategyEngine;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.File;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

@Service
public class DataStoreService {

    private final ObjectMapper om = new ObjectMapper();
    private final ResourceLoader resourceLoader;
    private final PricingStrategyEngine pricingEngine;

    private final AtomicReference<List<Product>> marketProducts = new AtomicReference<>(List.of());
    private final AtomicReference<List<Product>> companyProducts = new AtomicReference<>(List.of());
    private final AtomicReference<Map<String, Product>> marketByEan = new AtomicReference<>(Map.of());
    private final AtomicReference<Map<String, Product>> companyByEan = new AtomicReference<>(Map.of());
    private final AtomicReference<String> lastLoadedAt = new AtomicReference<>(null);
    private final AtomicReference<String> lastCompanySource = new AtomicReference<>(null);

    private final AtomicReference<Map<String, OverrideEntry>> overridesById = new AtomicReference<>(new LinkedHashMap<>());
    private final AtomicReference<Map<String, OverrideEntry>> overridesByEan = new AtomicReference<>(new HashMap<>());

    @Value("${app.data.overridesPath:file:./data/overrides.json}")
    private String overridesPath;

    @Value("${app.data.autoPersistOverrides:true}")
    private boolean autoPersistOverrides;

    public DataStoreService(ResourceLoader resourceLoader, PricingStrategyEngine pricingEngine) {
        this.resourceLoader = resourceLoader;
        this.pricingEngine = pricingEngine;
    }

    /* =========================================================
       READ helpers (existing public API)
       ========================================================= */

    public String getLastLoadedAt() { return lastLoadedAt.get(); }
    public List<Product> market() { return marketProducts.get(); }
    public List<Product> company() { return companyProducts.get(); }
    public Map<String, Product> marketIndex() { return marketByEan.get(); }
    public Map<String, Product> companyIndex() { return companyByEan.get(); }

    public List<Product> getCompanyProducts() {
        List<Product> c = companyProducts.get();
        return (c == null || c.isEmpty()) ? List.of() : List.copyOf(c);
    }

    public List<Product> getMarketProducts() {
        List<Product> m = marketProducts.get();
        return (m == null || m.isEmpty()) ? List.of() : List.copyOf(m);
    }

    public Product getMarketProductByEan(String ean) {
        if (ean == null || ean.isBlank()) return null;
        return marketByEan.get().get(ean);
    }

    public Product getCompanyProductByEan(String ean) {
        if (ean == null || ean.isBlank()) return null;
        return companyByEan.get().get(ean);
    }

    public Map<String, Object> overridesMeta() {
        return Map.of(
                "path", overridesPath,
                "count", overridesById.get().size(),
                "autoPersist", autoPersistOverrides
        );
    }


    public synchronized void loadAll(String marketPath,
                                     String companyPath,
                                     String enrichedMarketPath,
                                     boolean useEnrichedMarket) {
        try {
            String effectiveMarketPath = pickMarketPath(marketPath, enrichedMarketPath, useEnrichedMarket);

            ensureInventoryFileIfMissing(companyPath);

            List<Map<String, Object>> rawMarket = readJsonArrayOrWrapped(effectiveMarketPath);
            List<Map<String, Object>> rawCompany = readJsonArrayOrWrapped(companyPath);

            List<Product> m = normalizeAll(rawMarket);
            List<Product> c = normalizeAll(rawCompany);

            m = new ArrayList<>(m.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList());
            c = new ArrayList<>(c.stream().filter(p -> p.ean != null && !p.ean.isBlank()).toList());

            lastCompanySource.set(companyPath);


            for (Product p : c) {
                if (p.priceMode == null) p.priceMode = PriceMode.AUTO;
            }

            loadOverridesIfPresent();
            applyOverridesToCompany(c);
            ensureUnderpricedBaseline(c);

            marketProducts.set(m);
            companyProducts.set(c);

            marketByEan.set(buildIndexMutable(m));
            companyByEan.set(buildIndexMutable(c));

            lastLoadedAt.set(Instant.now().toString());
            System.out.printf("[DATA] loaded market=%d company=%d at %s (marketSource=%s)%n",
                    m.size(), c.size(), lastLoadedAt.get(), effectiveMarketPath);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load JSON: " + e.getMessage(), e);
        }
    }

    public Double getMarketBenchmarkPrice(Product companyProduct) {
        if (companyProduct == null) return null;
        if (companyProduct.ean == null || companyProduct.ean.isBlank()) return null;

        Product m = marketByEan.get().get(companyProduct.ean);
        if (m == null) return null;

        Double min = m.priceMin;
        Double max = m.priceMax;

        if (min != null && max != null && min > 0 && max > 0) {
            return (min + max) / 2.0;
        }
        if (min != null && min > 0) return min;
        if (max != null && max > 0) return max;

        if (m.price > 0) return m.price;

        return null;
    }

    public Double getOurComparablePrice(Product p) {
        if (p == null) return null;

        if (p.getPriceMode() == PriceMode.MANUAL && p.manualPrice != null && p.manualPrice > 0) {
            return p.manualPrice;
        }
        if (p.recommendedPrice != null && p.recommendedPrice > 0) return p.recommendedPrice;
        if (p.ourPrice != null && p.ourPrice > 0) return p.ourPrice;
        if (p.price > 0) return p.price;

        return null;
    }

    public Double getEffectivePrice(Product p) {
        if (p == null) return null;
        PriceMode mode = (p.priceMode == null) ? PriceMode.AUTO : p.priceMode;
        if (mode == PriceMode.MANUAL && p.manualPrice != null) return p.manualPrice;
        return p.recommendedPrice;
    }

    public OverrideEntry getOverrideById(long productId) {
        return overridesById.get().get(String.valueOf(productId));
    }

    public OverrideEntry getOverrideByEan(String ean) {
        if (ean == null || ean.isBlank()) return null;
        return overridesByEan.get().get(ean);
    }

    private void ensureUnderpricedBaseline(List<Product> company) {
        if (company == null || company.isEmpty()) return;

        Map<String, OverrideEntry> byId = new LinkedHashMap<>(overridesById.get());
        Map<String, OverrideEntry> byEan = new HashMap<>(overridesByEan.get());

        boolean changed = false;
        String now = Instant.now().toString();

        for (Product p : company) {
            if (p == null || p.id <= 0) continue;

            String idKey = String.valueOf(p.id);
            OverrideEntry ov = byId.get(idKey);

            if (ov == null && p.ean != null && !p.ean.isBlank()) {
                ov = byEan.get(p.ean);
            }

            if (ov == null) {
                ov = new OverrideEntry();
                ov.id = idKey;
                ov.ean = (p.ean == null || p.ean.isBlank()) ? null : p.ean;
            }

            boolean hasMarket = ov.lastSeenMarketBenchmarkPresent && ov.lastSeenMarketBenchmark != null;
            boolean hasOur = ov.lastSeenOurComparablePricePresent && ov.lastSeenOurComparablePrice != null;

            if (!hasMarket || !hasOur) {
                Double marketNow = getMarketBenchmarkPrice(p);
                Double ourNow = getOurComparablePrice(p);

                ov.lastSeenMarketBenchmarkPresent = true;
                ov.lastSeenMarketBenchmark = (marketNow != null && marketNow > 0) ? marketNow : null;

                ov.lastSeenOurComparablePricePresent = true;
                ov.lastSeenOurComparablePrice = (ourNow != null && ourNow > 0) ? ourNow : null;

                ov.lastSeenAtPresent = true;
                ov.lastSeenAt = now;

                byId.put(ov.id, ov);
                if (ov.ean != null && !ov.ean.isBlank()) byEan.put(ov.ean, ov);

                changed = true;
            }
        }

        if (changed) {
            overridesById.set(byId);
            overridesByEan.set(byEan);
            if (autoPersistOverrides) persistOverrides();
            System.out.printf("[OVERRIDES] seeded underpriced baseline for company=%d%n", company.size());
        }
    }

    public synchronized Product acknowledgeMarketBaseline(long productId) {
        Product p = requireCompanyProduct(productId);

        Double marketNow = getMarketBenchmarkPrice(p);
        Double ourNow = getOurComparablePrice(p);
        String now = Instant.now().toString();

        Map<String, OverrideEntry> byId = new LinkedHashMap<>(overridesById.get());
        Map<String, OverrideEntry> byEan = new HashMap<>(overridesByEan.get());

        String idKey = String.valueOf(p.id);
        OverrideEntry ov = byId.getOrDefault(idKey, new OverrideEntry());
        ov.id = idKey;
        ov.ean = (p.ean == null || p.ean.isBlank()) ? null : p.ean;

        ov.lastSeenMarketBenchmarkPresent = true;
        ov.lastSeenMarketBenchmark = (marketNow != null && marketNow > 0) ? marketNow : null;

        ov.lastSeenOurComparablePricePresent = true;
        ov.lastSeenOurComparablePrice = (ourNow != null && ourNow > 0) ? ourNow : null;

        ov.lastSeenAtPresent = true;
        ov.lastSeenAt = now;

        byId.put(ov.id, ov);
        if (ov.ean != null && !ov.ean.isBlank()) byEan.put(ov.ean, ov);

        overridesById.set(byId);
        overridesByEan.set(byEan);

        if (autoPersistOverrides) persistOverrides();

        System.out.printf("[ACK] baseline updated id=%d ean=%s market=%s our=%s at=%s%n",
                p.id, p.ean, ov.lastSeenMarketBenchmark, ov.lastSeenOurComparablePrice, ov.lastSeenAt);

        return p;
    }

    public synchronized Product addCompanyProduct(Product p) {
        if (p == null) throw new IllegalArgumentException("product is null");

        if (p.id <= 0) {
            long next = nextCompanyId();
            p.id = next;
        }

        if (p.priceMode == null) p.priceMode = PriceMode.AUTO;

        List<Product> c = companyProducts.get();
        if (!(c instanceof ArrayList)) c = new ArrayList<>(c);

        c.add(p);

        companyProducts.set(c);
        companyByEan.set(buildIndexMutable(c));

        upsertOverrideFromProduct(p);

        acknowledgeMarketBaseline(p.id);

        if (autoPersistOverrides) persistOverrides();

        return p;
    }

    public synchronized Product updateCompanyProduct(String id, Consumer<Product> mutator) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id is required");
        if (mutator == null) throw new IllegalArgumentException("mutator is required");

        long pid = parseLong(id, -1);
        if (pid <= 0) throw new IllegalArgumentException("invalid id: " + id);

        Product p = getCompanyById(pid);
        if (p == null) throw new NoSuchElementException("Company product not found: " + id);

        mutator.accept(p);

        if (p.priceMode == null) p.priceMode = PriceMode.AUTO;
        p.lastUpdated = Instant.now().toString();

        companyByEan.set(buildIndexMutable(companyProducts.get()));

        upsertOverrideFromProduct(p);
        if (autoPersistOverrides) persistOverrides();

        return p;
    }

    public synchronized Product setManualPrice(long productId, double manualPrice) {
        if (manualPrice <= 0) throw new IllegalArgumentException("manualPrice must be > 0");
        Product p = requireCompanyProduct(productId);
        p.manualPrice = manualPrice;
        p.priceMode = PriceMode.MANUAL;
        p.lastUpdated = Instant.now().toString();

        upsertOverrideFromProduct(p);
        if (autoPersistOverrides) persistOverrides();

        return p;
    }

    public synchronized Product setPriceMode(long productId, PriceMode mode) {
        if (mode == null) mode = PriceMode.AUTO;
        Product p = requireCompanyProduct(productId);
        p.priceMode = mode;
        p.lastUpdated = Instant.now().toString();

        if (mode == PriceMode.AUTO) {
            p.manualPrice = null;
        }

        upsertOverrideFromProduct(p);
        if (autoPersistOverrides) persistOverrides();

        return p;
    }

    public synchronized Product resetToAuto(long productId) {
        Product p = requireCompanyProduct(productId);
        p.priceMode = PriceMode.AUTO;
        p.manualPrice = null;
        p.lastUpdated = Instant.now().toString();

        upsertOverrideFromProduct(p);
        if (autoPersistOverrides) persistOverrides();

        return p;
    }

    public synchronized Map<String, Object> persistOverrides() {
        try {
            if (overridesPath == null || overridesPath.isBlank()) {
                return Map.of("ok", false, "reason", "overridesPath not set");
            }

            if (overridesPath.startsWith("classpath:")) {
                return Map.of(
                        "ok", false,
                        "reason", "overridesPath is classpath (read-only)",
                        "overridesPath", overridesPath,
                        "hint", "set app.data.overridesPath to e.g. file:./data/overrides.json"
                );
            }

            Resource r = resourceLoader.getResource(overridesPath);
            File file = r.getFile();
            File parent = file.getParentFile();
            if (parent != null) parent.mkdirs();

            List<OverrideEntry> list = new ArrayList<>(overridesById.get().values());
            list.sort(Comparator.comparingLong(o -> parseLong(o.id, Long.MAX_VALUE)));

            om.writerWithDefaultPrettyPrinter().writeValue(file, list);

            return Map.of(
                    "ok", true,
                    "writtenTo", file.getAbsolutePath(),
                    "count", list.size()
            );
        } catch (Exception e) {
            return Map.of("ok", false, "reason", e.getMessage(), "overridesPath", overridesPath);
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
       PRICING ENGINE (recommended price)
       ========================================================= */

    public record BulkRecomputeStats(int recomputed, int skipped, int errors) {}

    public BulkRecomputeStats recomputeAllCompanyPrices() {
        int ok = 0, skipped = 0, errors = 0;

        List<Product> list = companyProducts.get();
        if (list == null || list.isEmpty()) return new BulkRecomputeStats(0, 0, 0);

        for (Product p : list) {
            try {
                if (p == null || p.id <= 0) { skipped++; continue; }
                recomputeRecommendedPrice(p.id);
                ok++;
            } catch (Exception e) {
                errors++;
            }
        }

        return new BulkRecomputeStats(ok, skipped, errors);
    }

    public Product getCompanyById(long id) {
        for (Product p : companyProducts.get()) {
            if (p != null && p.id == id) return p;
        }
        return null;
    }

    public synchronized Product recomputeRecommendedPrice(long productId) {
        Product p = requireCompanyProduct(productId);

        Product m = (p.ean == null || p.ean.isBlank()) ? null : marketByEan.get().get(p.ean);

        BigDecimal marketMin = null;
        BigDecimal marketMax = null;
        Integer competitorCount = 0;

        if (m != null) {
            if (m.priceMin != null && m.priceMin > 0) marketMin = bd(m.priceMin);
            if (m.priceMax != null && m.priceMax > 0) marketMax = bd(m.priceMax);

            if (marketMin == null && marketMax == null && m.price > 0) {
                marketMin = bd(m.price);
                marketMax = bd(m.price);
            }

            if (m.offersCount != null && m.offersCount > 0) competitorCount = m.offersCount;
        }

        if (marketMin == null && marketMax == null) {
            Double median = estimateMarketMedianFor(p);
            if (median == null || median <= 0) {
                p.recommendedPrice = null;
                p.lastUpdated = Instant.now().toString();

                upsertOverrideFromProduct(p);
                if (autoPersistOverrides) persistOverrides();

                return p;
            }
            marketMin = bd(median);
            marketMax = bd(median);
        }

        BigDecimal currentPrice = (p.price > 0) ? bd(p.price) : null;

        BigDecimal cost = null;

        BigDecimal basePrice = currentPrice != null ? currentPrice
                : marketMin != null ? marketMin
                : marketMax != null ? marketMax
                : BigDecimal.ZERO;

        var ctx = new PricingContext(
                String.valueOf(p.id),
                cost,
                currentPrice,
                new MarketSnapshot(marketMin, marketMax, competitorCount),
                Map.of(
                        "ean", p.ean == null ? "" : p.ean,
                        "brand", p.brand == null ? "" : p.brand,
                        "category", p.category == null ? "" : p.category
                )
        );

        PricingResult result = pricingEngine.price(ctx, basePrice);

        p.recommendedPrice = (result.finalPrice() == null) ? null : result.finalPrice().doubleValue();
        p.lastUpdated = Instant.now().toString();

        upsertOverrideFromProduct(p);
        if (autoPersistOverrides) persistOverrides();

        if (result.ruleHits() != null && !result.ruleHits().isEmpty()) {
            System.out.printf("[PRICING] id=%d ean=%s base=%s -> final=%s hits=%s%n",
                    p.id, p.ean, result.basePrice(), result.finalPrice(), result.ruleHits());
        } else {
            System.out.printf("[PRICING] id=%d ean=%s base=%s -> final=%s (no rule hits)%n",
                    p.id, p.ean, result.basePrice(), result.finalPrice());
        }

        return p;
    }

    private Product requireCompanyProduct(long id) {
        Product p = getCompanyById(id);
        if (p == null) throw new NoSuchElementException("Company product not found: " + id);
        if (p.priceMode == null) p.priceMode = PriceMode.AUTO;
        return p;
    }

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

    /* =========================================================
       ENTERPRISE BOOT FIX: seed missing company file
       ========================================================= */

    private void ensureInventoryFileIfMissing(String companyPath) {
        try {
            if (companyPath == null || companyPath.isBlank()) return;
            if (!companyPath.startsWith("file:")) return;

            Resource r = resourceLoader.getResource(companyPath);
            if (r.exists()) return;

            Resource seed = resourceLoader.getResource("classpath:data/inventory.mock.json");
            if (!seed.exists()) return;

            File target = r.getFile();
            File parent = target.getParentFile();
            if (parent != null) parent.mkdirs();

            Object root = om.readValue(seed.getInputStream(), Object.class);
            om.writerWithDefaultPrettyPrinter().writeValue(target, root);

            System.out.printf("[DATA] seeded missing company file from classpath: %s%n", target.getAbsolutePath());
        } catch (Exception e) {
            System.out.printf("[DATA] seed company file skipped: %s%n", e.getMessage());
        }
    }

    /* =========================================================
       OVERRIDES: load/apply/save
       ========================================================= */

    private void loadOverridesIfPresent() {
        try {
            if (overridesPath == null || overridesPath.isBlank()) return;
            if (overridesPath.startsWith("classpath:")) return;

            Resource r = resourceLoader.getResource(overridesPath);
            if (!r.exists()) return;

            Object root = om.readValue(r.getInputStream(), Object.class);

            List<OverrideEntry> list = new ArrayList<>();

            if (root instanceof List<?> arr) {
                for (Object o : arr) {
                    OverrideEntry e = om.convertValue(o, OverrideEntry.class);
                    if (e != null) list.add(e);
                }
            } else if (root instanceof Map<?, ?> map) {
                Object overrides = ((Map<?, ?>) map).get("overrides");
                if (overrides instanceof List<?> arr) {
                    for (Object o : arr) {
                        OverrideEntry e = om.convertValue(o, OverrideEntry.class);
                        if (e != null) list.add(e);
                    }
                }
            }

            Map<String, OverrideEntry> byId = new LinkedHashMap<>();
            Map<String, OverrideEntry> byEan = new HashMap<>();
            for (OverrideEntry e : list) {
                if (e == null) continue;
                if (e.id != null && !e.id.isBlank()) byId.put(e.id, e);
                if (e.ean != null && !e.ean.isBlank()) byEan.put(e.ean, e);
            }

            overridesById.set(byId);
            overridesByEan.set(byEan);

            System.out.printf("[OVERRIDES] loaded=%d from %s%n", byId.size(), overridesPath);
        } catch (Exception e) {
            System.out.printf("[OVERRIDES] load skipped: %s%n", e.getMessage());
        }
    }

    private void applyOverridesToCompany(List<Product> company) {
        if (company == null || company.isEmpty()) return;

        Map<String, OverrideEntry> byId = overridesById.get();
        Map<String, OverrideEntry> byEan = overridesByEan.get();
        if ((byId == null || byId.isEmpty()) && (byEan == null || byEan.isEmpty())) return;

        int applied = 0;

        for (Product p : company) {
            if (p == null) continue;

            OverrideEntry ov = null;

            String idKey = String.valueOf(p.id);
            if (byId != null) ov = byId.get(idKey);

            if (ov == null && p.ean != null && !p.ean.isBlank() && byEan != null) {
                ov = byEan.get(p.ean);
            }

            if (ov == null) continue;

            if (ov.priceMode != null) {
                try {
                    p.priceMode = PriceMode.valueOf(String.valueOf(ov.priceMode).trim().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) {}
            }

            if (ov.manualPricePresent) p.manualPrice = ov.manualPrice;
            if (ov.ourPricePresent) p.ourPrice = ov.ourPrice;
            if (ov.recommendedPricePresent) p.recommendedPrice = ov.recommendedPrice;

            if (ov.lastUpdated != null && !ov.lastUpdated.isBlank()) {
                p.lastUpdated = ov.lastUpdated;
            }

            if (p.priceMode == PriceMode.MANUAL && p.manualPrice == null) {
                p.priceMode = PriceMode.AUTO;
            }

            applied++;
        }

        if (applied > 0) {
            System.out.printf("[OVERRIDES] applied=%d to company=%d%n", applied, company.size());
        }
    }

    private void upsertOverrideFromProduct(Product p) {
        if (p == null) return;

        OverrideEntry e = new OverrideEntry();
        e.id = String.valueOf(p.id);
        e.ean = (p.ean == null || p.ean.isBlank()) ? null : p.ean;

        e.priceMode = (p.priceMode == null) ? null : p.priceMode.name();

        e.manualPricePresent = true;
        e.manualPrice = p.manualPrice;

        e.ourPricePresent = true;
        e.ourPrice = p.ourPrice;

        e.recommendedPricePresent = true;
        e.recommendedPrice = p.recommendedPrice;

        e.lastUpdated = (p.lastUpdated == null || p.lastUpdated.isBlank())
                ? Instant.now().toString()
                : p.lastUpdated;

        // IMPORTANT: do NOT wipe baseline fields here. We keep lastSeen* unless explicitly ack'd.
        OverrideEntry existing = overridesById.get().get(e.id);
        if (existing != null) {
            e.lastSeenMarketBenchmarkPresent = existing.lastSeenMarketBenchmarkPresent;
            e.lastSeenMarketBenchmark = existing.lastSeenMarketBenchmark;

            e.lastSeenOurComparablePricePresent = existing.lastSeenOurComparablePricePresent;
            e.lastSeenOurComparablePrice = existing.lastSeenOurComparablePrice;

            e.lastSeenAtPresent = existing.lastSeenAtPresent;
            e.lastSeenAt = existing.lastSeenAt;
        }

        Map<String, OverrideEntry> byId = new LinkedHashMap<>(overridesById.get());
        byId.put(e.id, e);
        overridesById.set(byId);

        Map<String, OverrideEntry> byEan = new HashMap<>(overridesByEan.get());
        if (e.ean != null && !e.ean.isBlank()) byEan.put(e.ean, e);
        overridesByEan.set(byEan);
    }

    private long nextCompanyId() {
        long max = 0;
        for (Product p : companyProducts.get()) {
            if (p != null && p.id > max) max = p.id;
        }
        return max + 1;
    }

    /* =========================================================
       Loader/normalizer
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

        out.priceMin = toNullableDouble(p.get("priceMin"));
        out.priceMax = toNullableDouble(p.get("priceMax"));
        out.ourPrice = toNullableDouble(p.get("ourPrice"));
        out.offersCount = toNullableInt(p.get("offersCount"));
        out.lastUpdated = safeText(firstNonBlank(p, "lastUpdated"));

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

    private Map<String, Product> buildIndexMutable(List<Product> arr) {
        Map<String, Product> m = new HashMap<>();
        for (Product p : arr) {
            if (p != null && p.ean != null && !p.ean.isBlank()) m.put(String.valueOf(p.ean), p);
        }
        return m;
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

    private long parseLong(String s, long fallback) {
        try { return Long.parseLong(String.valueOf(s)); } catch (Exception e) { return fallback; }
    }

    private BigDecimal bd(Double v) {
        if (v == null) return null;
        return BigDecimal.valueOf(v);
    }

    /* =========================================================
       Overrides DTO (Jackson-friendly)
       ========================================================= */

    public static class OverrideEntry {
        public String id;   // product id as string
        public String ean;  // optional convenience key
        public String priceMode; // "AUTO" / "MANUAL"

        // presence flags so we can intentionally persist nulls
        public boolean manualPricePresent;
        public Double manualPrice;

        public boolean ourPricePresent;
        public Double ourPrice;

        public boolean recommendedPricePresent;
        public Double recommendedPrice;

        public String lastUpdated;

        // NEW: baseline ("last seen") for UNDERPRICED stale detection
        public boolean lastSeenMarketBenchmarkPresent;
        public Double lastSeenMarketBenchmark;

        public boolean lastSeenOurComparablePricePresent;
        public Double lastSeenOurComparablePrice;

        public boolean lastSeenAtPresent;
        public String lastSeenAt;

        public OverrideEntry() {}
    }
}