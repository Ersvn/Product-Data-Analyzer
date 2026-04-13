package com.example.pricecomparer.db;

import java.math.BigDecimal;

public final class DbSeedUtils {

    private DbSeedUtils() {
    }

    public static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        return s;
    }


    public static BigDecimal toBigDecimal(Object v) {
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

    public static String normEan(String ean) {
        if (ean == null) return null;
        String normalized = ean.replaceAll("[^0-9]", "");
        return normalized.isBlank() ? null : normalized;
    }

}