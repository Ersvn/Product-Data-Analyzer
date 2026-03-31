package com.example.pricecomparer.db;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

public final class DbRequestParsers {

    private DbRequestParsers() {
    }

    public static String str(Map<String, Object> body, String... keys) {
        if (body == null || keys == null) return null;

        for (String k : keys) {
            Object v = body.get(k);
            if (v == null) continue;

            String s = String.valueOf(v).trim();
            if (!s.isEmpty()) return s;
        }
        return null;
    }

    public static BigDecimal dec(Map<String, Object> body, String... keys) {
        if (body == null || keys == null) return null;

        for (String k : keys) {
            Object v = body.get(k);
            if (v == null) continue;

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
        return null;
    }

    public static String normalizeSearch(String q) {
        return q == null ? "" : q.trim();
    }

    public static String normalizeSearchLower(String q) {
        return q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
    }

    public static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    public static long parseLongOrDefault(String value, long fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    public static String normalizeDigits(String value) {
        if (value == null) return "";
        return value.replaceAll("[^0-9]", "");
    }
}