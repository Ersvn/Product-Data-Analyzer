package com.example.pricecomparer.db;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

public final class DbImportUtils {

    private DbImportUtils() {
    }

    public static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        return s;
    }

    public static String firstNonBlank(Map<String, Object> map, String... keys) {
        if (map == null || keys == null) return null;

        for (String key : keys) {
            Object v = map.get(key);
            if (v == null) continue;

            String s = String.valueOf(v).trim();
            if (!s.isBlank() && !"null".equalsIgnoreCase(s)) {
                return s;
            }
        }
        return null;
    }

    public static BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;

        try {
            if (v instanceof BigDecimal bd) return bd;
            if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());

            String s = String.valueOf(v).trim();
            if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;

            return new BigDecimal(s.replace(",", "."));
        } catch (Exception ignored) {
            return null;
        }
    }

    public static String normEan(String ean) {
        if (ean == null) return null;
        String normalized = ean.replaceAll("[^0-9]", "");
        return normalized.isBlank() ? null : normalized;
    }

    public static String normalizeIdentifier(String type, String value) {
        String v = value == null ? "" : value.trim();

        return switch (type.toUpperCase(Locale.ROOT)) {
            case "EAN", "GTIN", "UPC" -> v.replaceAll("[^0-9]", "");
            case "MPN", "SKU" -> v.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
            default -> v.toUpperCase(Locale.ROOT);
        };
    }

    public static String chooseCompanySku(String ean, String mpnNorm, String skuNorm, String rawId) {
        if (ean != null && !ean.isBlank()) {
            return "EAN:" + ean;
        }
        if (mpnNorm != null && !mpnNorm.isBlank()) {
            return "MPN:" + mpnNorm;
        }
        if (skuNorm != null && !skuNorm.isBlank()) {
            return "SKU:" + skuNorm;
        }
        if (rawId != null && !rawId.isBlank()) {
            return "ID:" + rawId;
        }
        return null;
    }
}