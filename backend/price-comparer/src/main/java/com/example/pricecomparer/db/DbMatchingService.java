package com.example.pricecomparer.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class DbMatchingService {

    private final JdbcTemplate jdbc;

    public DbMatchingService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> matchOneByCompanyId(long companyId) {
        Map<String, Object> c = jdbc.queryForMap("""
            select id, company_sku, name, brand, ean, mpn
            from company_listings
            where id = ?
        """, companyId);

        Long productId = resolveProductId(c);

        if (productId == null) {
            jdbc.update("update company_listings set matched_product_id = null where id = ?", companyId);
            return Map.of(
                    "ok", false,
                    "companyId", companyId,
                    "message", "No match found (EAN>MPN>SKU)"
            );
        }

        jdbc.update("update company_listings set matched_product_id = ? where id = ?", productId, companyId);

        return Map.of(
                "ok", true,
                "companyId", companyId,
                "matchedProductId", productId
        );
    }

    @Transactional
    public Map<String, Object> matchAll(int limit) {
        // Matcha bara de som inte är matchade
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select id, company_sku, name, brand, ean, mpn
            from company_listings
            where matched_product_id is null
            order by last_updated desc nulls last
            limit ?
        """, limit);

        int matched = 0;
        int notMatched = 0;

        for (Map<String, Object> c : rows) {
            long companyId = ((Number) c.get("id")).longValue();
            Long productId = resolveProductId(c);

            if (productId == null) {
                notMatched++;
                continue;
            }

            jdbc.update("update company_listings set matched_product_id = ? where id = ?", productId, companyId);
            matched++;
        }

        Integer remaining = jdbc.queryForObject("""
            select count(*) from company_listings where matched_product_id is null
        """, Integer.class);

        return Map.of(
                "ok", true,
                "processed", rows.size(),
                "matched", matched,
                "notMatched", notMatched,
                "remainingUnmatched", remaining
        );
    }

    private Long resolveProductId(Map<String, Object> c) {
        String ean = normEan(str(c.get("ean")));
        String mpn = normKey(str(c.get("mpn")));
        String brand = normBrand(str(c.get("brand")));
        String companySku = str(c.get("company_sku"));
        // EAN direct match on products.ean
        if (ean != null) {
            List<Long> ids = jdbc.queryForList("select id from products where ean = ?", Long.class, ean);
            if (!ids.isEmpty()) return ids.get(0);
        }

        // MPN via identifiers
        if (mpn != null) {
            Long id = resolveByIdentifierSafe("MPN", mpn, brand);
            if (id != null) return id;
        }

        // SKU via identifiers
        String sku = null;

        if (companySku != null && companySku.toUpperCase(Locale.ROOT).startsWith("SKU:")) {
            sku = normKey(companySku.substring(4));
        }

        if (sku != null) {
            List<Long> ids = jdbc.queryForList("""
                select pi.product_id
                from product_identifiers pi
                where pi.type = 'SKU' and pi.normalized_value = ?
            """, Long.class, sku);

            Long best = pickBestByBrand(ids, brand);
            if (best != null) return best;
        }

        return null;
    }

    private Long resolveByIdentifierSafe(String type, String normalizedValue, String brandNorm) {
        // Hämta kandidater + deras brand i en query
        List<Map<String, Object>> rows = jdbc.queryForList("""
            select pi.product_id as id, p.brand as brand
            from product_identifiers pi
            join products p on p.id = pi.product_id
            where pi.type = ? and pi.normalized_value = ?
        """, type, normalizedValue);

        if (rows.isEmpty()) return null;

        if (brandNorm != null) {
            for (Map<String, Object> r : rows) {
                String b = normBrand(str(r.get("brand")));
                if (brandNorm.equals(b)) {
                    return ((Number) r.get("id")).longValue();
                }
            }
            return null;
        }

        // Om brand saknas: tillåt bara om det är entydigt
        if (rows.size() == 1) {
            return ((Number) rows.get(0).get("id")).longValue();
        }

        // Brand saknas och flera kandidater
        return null;
    }

    private Long pickBestByBrand(List<Long> candidateIds, String brandNorm) {
        if (candidateIds == null || candidateIds.isEmpty()) return null;
        if (candidateIds.size() == 1) return candidateIds.get(0);
        if (brandNorm == null) return candidateIds.get(0);

        // Try filter candidates by products.brand
        for (Long id : candidateIds) {
            String b = jdbc.queryForObject("select brand from products where id = ?", String.class, id);
            if (brandNorm.equals(normBrand(b))) return id;
        }
        return candidateIds.get(0);
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        return s;
    }

    private static String normEan(String ean) {
        if (ean == null) return null;
        String n = ean.replaceAll("[^0-9]", "");
        return n.isBlank() ? null : n;
    }

    private static String normKey(String v) {
        if (v == null) return null;
        // same idea as normalize("MPN"/"SKU")
        String n = v.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        return n.isBlank() ? null : n;
    }

    private static String normBrand(String v) {
        if (v == null) return null;
        String n = v.trim().toUpperCase(Locale.ROOT);
        return n.isBlank() ? null : n;
    }
}