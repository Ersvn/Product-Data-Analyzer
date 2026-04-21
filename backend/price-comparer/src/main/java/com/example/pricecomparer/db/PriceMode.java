package com.example.pricecomparer.db;

import java.util.Locale;

public enum PriceMode {
    AUTO,
    MANUAL;

    public static PriceMode parseOrNull(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
