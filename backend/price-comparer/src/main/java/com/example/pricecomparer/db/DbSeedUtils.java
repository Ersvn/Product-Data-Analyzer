package com.example.pricecomparer.db;

import java.math.BigDecimal;

public final class DbSeedUtils {

    private DbSeedUtils() {
    }

    public static String str(Object value) {
        return DbValueUtils.str(value);
    }

    public static BigDecimal toBigDecimal(Object value) {
        return DbValueUtils.dec(value);
    }

    public static String normEan(String ean) {
        String normalized = DbValueUtils.normEan(ean);
        return normalized.isBlank() ? null : normalized;
    }
}
