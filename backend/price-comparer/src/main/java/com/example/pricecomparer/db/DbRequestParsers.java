package com.example.pricecomparer.db;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Map;

public final class DbRequestParsers {

    private DbRequestParsers() {
    }

    public static String str(Map<String, Object> body, String... keys) {
        if (body == null || keys == null) return null;
        for (String key : keys) {
            String value = DbValueUtils.str(body.get(key));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    public static BigDecimal dec(Map<String, Object> body, String... keys) {
        if (body == null || keys == null) return null;
        for (String key : keys) {
            if (!body.containsKey(key)) continue;
            BigDecimal value = DbValueUtils.dec(body.get(key));
            if (value != null) {
                return value;
            }
            Object raw = body.get(key);
            if (raw == null) return null;
            String s = String.valueOf(raw).trim();
            if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        }
        return null;
    }

    public static String normalizeSearch(String q) {
        return q == null ? "" : q.trim();
    }

    public static String normalizeSearchLower(String q) {
        return normalizeSearch(q).toLowerCase(Locale.ROOT);
    }

    public static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
