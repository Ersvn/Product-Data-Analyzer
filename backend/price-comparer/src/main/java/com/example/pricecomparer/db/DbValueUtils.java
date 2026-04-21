package com.example.pricecomparer.db;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class DbValueUtils {

    private DbValueUtils() {
    }

    public static String str(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        return s;
    }

    public static String normEan(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^0-9]", "");
    }

    public static String normUid(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("[^0-9A-Za-z]", "");
    }

    public static String normKey(String raw) {
        if (raw == null) return null;
        String normalized = raw.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    public static BigDecimal dec(Object value) {
        if (value == null) return null;
        try {
            if (value instanceof BigDecimal bd) return bd;
            if (value instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
            String s = String.valueOf(value).trim().replace(",", ".");
            if (s.isBlank() || "null".equalsIgnoreCase(s)) return null;
            return new BigDecimal(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static Integer intOrNull(Object value) {
        if (value == null) return null;
        try {
            if (value instanceof Number n) return n.intValue();
            String s = String.valueOf(value).trim();
            if (s.isBlank()) return null;
            return Integer.parseInt(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static Long longOrNull(Object value) {
        if (value == null) return null;
        try {
            if (value instanceof Number n) return n.longValue();
            String s = String.valueOf(value).trim();
            if (s.isBlank()) return null;
            return Long.parseLong(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    public static double doubleOrZero(Object value) {
        if (value == null) return 0.0;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ignored) {
            return 0.0;
        }
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> listOfMaps(Object value) {
        return value instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> mapOrNull(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : null;
    }

    public static BigDecimal benchmarkPrice(BigDecimal preferred, BigDecimal min, BigDecimal max) {
        if (preferred != null && preferred.signum() > 0) return preferred;
        if (min != null && min.signum() > 0 && max != null && max.signum() > 0) {
            return min.add(max).divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP);
        }
        if (min != null && min.signum() > 0) return min;
        if (max != null && max.signum() > 0) return max;
        return null;
    }

    public static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    public static double round4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }
}
