// DbImportService.java
package com.example.pricecomparer.db;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class DbImportService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper om;
    private final ResourceLoader resourceLoader;

    @Value("${app.data.marketPath}")
    private String marketPath;

    @Value("${app.data.companyPath}")
    private String companyPath;

    public DbImportService(JdbcTemplate jdbc, ObjectMapper om, ResourceLoader resourceLoader) {
        this.jdbc = jdbc;
        this.om = om;
        this.resourceLoader = resourceLoader;
    }

    @Transactional
    public Map<String, Object> importAll() throws Exception {

        int marketRows = importMarket();
        int companyRows = importCompany();

        Integer products = jdbc.queryForObject("select count(*) from products", Integer.class);
        Integer merchants = jdbc.queryForObject("select count(*) from merchants", Integer.class);
        Integer offers = jdbc.queryForObject("select count(*) from offers", Integer.class);
        Integer company = jdbc.queryForObject("select count(*) from company_listings", Integer.class);

        return Map.of(
                "ok", true,
                "market_rows_processed", marketRows,
                "company_rows_processed", companyRows,
                "products_total", products,
                "merchants_total", merchants,
                "offers_total", offers,
                "company_listings_total", company
        );
    }


    private int importMarket() throws Exception {
        List<Map<String, Object>> rows = readJsonArray(marketPath);
        int processed = 0;

        for (Map<String, Object> r : rows) {
            String ean = normEan(str(r.get("ean")));
            if (ean == null) continue; // vi kräver EAN för master i denna fas

            String name = str(r.get("name"));
            String brand = str(r.get("brand"));
            String category = str(r.get("category"));

            String store = str(r.get("store"));
            String url = str(r.get("url"));

            BigDecimal price = toBigDecimal(r.get("price"));
            if (price == null) price = toBigDecimal(r.get("priceMin"));
            if (price == null) price = toBigDecimal(r.get("priceMax"));

            Long productId = upsertProductByEan(ean, name, brand, category);

            // Identifier "låses" första gången den sätts
            upsertIdentifier(productId, "EAN", ean, "MOCK_MARKET", 100);

            if (store != null && price != null) {
                Long merchantId = upsertMerchant(store);
                upsertOffer(productId, merchantId, price, "SEK", true, url);
            }

            processed++;
        }

        return processed;
    }

    private int importCompany() throws Exception {
        List<Map<String, Object>> rows = readJsonArray(companyPath);
        int processed = 0;

        for (Map<String, Object> r : rows) {
            String name = str(r.get("name"));
            String brand = str(r.get("brand"));
            String category = str(r.get("category"));

            String ean = normEan(str(r.get("ean")));
            if (ean == null) continue;

            String mpnRaw = str(r.get("mpn"));
            String mpnNorm = (mpnRaw != null) ? normalize("MPN", mpnRaw) : null;

            String skuRaw = firstNonBlank(r, "companySku", "sku");
            String skuNorm = (skuRaw != null) ? normalize("SKU", skuRaw) : null;

            String id = str(r.get("id"));

            // company_sku: EAN > MPN > SKU > ID (men UNIQUE är på ean)
            String companySku = "EAN:" + ean;
            if (companySku.isBlank()) {
                if (mpnNorm != null && !mpnNorm.isBlank()) companySku = "MPN:" + mpnNorm;
                else if (skuNorm != null && !skuNorm.isBlank()) companySku = "SKU:" + skuNorm;
                else if (id != null && !id.isBlank()) companySku = "ID:" + id;
                else companySku = "ID:" + UUID.randomUUID();
            }

            BigDecimal ourPrice = toBigDecimal(r.get("ourPrice"));
            if (ourPrice == null) ourPrice = toBigDecimal(r.get("price"));

            BigDecimal costPrice = toBigDecimal(r.get("costPrice"));
            if (costPrice == null) costPrice = toBigDecimal(r.get("cost"));

            // Om vi inte har MPN -> spara null (inte name)
            String mpnToStore = (mpnNorm != null && !mpnNorm.isBlank()) ? mpnRaw : null;

            jdbc.update("""
                insert into company_listings
                  (company_sku, name, brand, category, ean, mpn, cost_price, our_price, price_mode, manual_price, last_updated)
                values
                  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                on conflict (ean) do update set
                  company_sku = excluded.company_sku,
                  name        = excluded.name,
                  brand       = excluded.brand,
                  category    = excluded.category,
                  mpn         = excluded.mpn,
                  cost_price  = excluded.cost_price,
                  our_price   = excluded.our_price,
                  last_updated = now(),

                  price_mode = case
                                when company_listings.price_mode = 'MANUAL' then company_listings.price_mode
                                else excluded.price_mode
                              end,
                  manual_price = case
                                  when company_listings.price_mode = 'MANUAL' then company_listings.manual_price
                                  else excluded.manual_price
                                end
                """,
                    companySku,
                    name,
                    brand,
                    category,
                    ean,
                    mpnToStore,
                    costPrice,
                    ourPrice,
                    "AUTO",
                    null
            );

            // Seeda master + identifiers
            Long productId = upsertProductByEan(ean, name, brand, category);
            upsertIdentifier(productId, "EAN", ean, "MOCK_COMPANY", 100);

            if (mpnNorm != null && !mpnNorm.isBlank()) {
                upsertIdentifier(productId, "MPN", mpnRaw, "MOCK_COMPANY", 70);
            }
            if (skuNorm != null && !skuNorm.isBlank()) {
                upsertIdentifier(productId, "SKU", skuRaw, "MOCK_COMPANY", 60);
            }

            processed++;
        }

        return processed;
    }

    private Long upsertProductByEan(String ean, String name, String brand, String category) {
        jdbc.update("""
            insert into products (name, brand, category, ean, mpn, created_at, updated_at)
            values (?, ?, ?, ?, null, now(), now())
            on conflict (ean) do update set
              name=coalesce(excluded.name, products.name),
              brand=coalesce(excluded.brand, products.brand),
              category=coalesce(excluded.category, products.category),
              updated_at=now()
            """, name, brand, category, ean);

        return jdbc.queryForObject("select id from products where ean = ?", Long.class, ean);
    }

    private void upsertIdentifier(Long productId, String type, String value, String source, int confidence) {
        String norm = normalize(type, value);
        jdbc.update("""
            insert into product_identifiers (product_id, type, value, normalized_value, source, confidence)
            values (?, ?, ?, ?, ?, ?)
            on conflict (type, normalized_value) do nothing
            """, productId, type, value, norm, source, confidence);
    }

    private Long upsertMerchant(String name) {
        jdbc.update("""
            insert into merchants (name, country, active)
            values (?, 'SE', true)
            on conflict (name) do nothing
            """, name);

        return jdbc.queryForObject("select id from merchants where name = ?", Long.class, name);
    }

    private void upsertOffer(Long productId, Long merchantId, BigDecimal price, String currency, boolean inStock, String url) {
        jdbc.update("""
            insert into offers (product_id, merchant_id, price, currency, in_stock, url, fetched_at)
            values (?, ?, ?, ?, ?, ?, now())
            on conflict (product_id, merchant_id) do update set
              price=excluded.price,
              currency=excluded.currency,
              in_stock=excluded.in_stock,
              url=excluded.url,
              fetched_at=now()
            """, productId, merchantId, price, currency, inStock, url);
    }

    private List<Map<String, Object>> readJsonArray(String path) throws Exception {
        Resource res = resourceLoader.getResource(path);
        try (InputStream in = res.getInputStream()) {
            byte[] bytes = in.readAllBytes();
            Charset cs = detectCharsetFromBom(bytes);
            String json = new String(stripBom(bytes), cs);
            return om.readValue(json, new TypeReference<>() {});
        }
    }

    private static Charset detectCharsetFromBom(byte[] b) {
        if (b.length >= 2) {
            int b0 = b[0] & 0xFF;
            int b1 = b[1] & 0xFF;

            if (b0 == 0xFF && b1 == 0xFE) return StandardCharsets.UTF_16LE;
            if (b0 == 0xFE && b1 == 0xFF) return StandardCharsets.UTF_16BE;
        }
        return StandardCharsets.UTF_8;
    }

    private static byte[] stripBom(byte[] b) {
        if (b.length >= 3) {
            int b0 = b[0] & 0xFF, b1 = b[1] & 0xFF, b2 = b[2] & 0xFF;
            if (b0 == 0xEF && b1 == 0xBB && b2 == 0xBF) {
                return Arrays.copyOfRange(b, 3, b.length);
            }
        }
        if (b.length >= 2) {
            int b0 = b[0] & 0xFF, b1 = b[1] & 0xFF;
            if ((b0 == 0xFF && b1 == 0xFE) || (b0 == 0xFE && b1 == 0xFF)) {
                return Arrays.copyOfRange(b, 2, b.length);
            }
        }
        return b;
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        return s;
    }

    private static String firstNonBlank(Map<String, Object> m, String... keys) {
        for (String k : keys) {
            Object v = m.get(k);
            if (v == null) continue;
            String s = String.valueOf(v).trim();
            if (!s.isBlank() && !"null".equalsIgnoreCase(s)) return s;
        }
        return null;
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        try {
            if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
            String s = String.valueOf(v).trim();
            if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
            return new BigDecimal(s.replace(",", "."));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String normEan(String ean) {
        if (ean == null) return null;
        String n = ean.replaceAll("[^0-9]", "");
        return n.isBlank() ? null : n;
    }

    private static String normalize(String type, String value) {
        String v = value == null ? "" : value.trim();
        return switch (type.toUpperCase(Locale.ROOT)) {
            case "EAN", "GTIN", "UPC" -> v.replaceAll("[^0-9]", "");
            case "MPN", "SKU" -> v.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
            default -> v.toUpperCase(Locale.ROOT);
        };
    }
}