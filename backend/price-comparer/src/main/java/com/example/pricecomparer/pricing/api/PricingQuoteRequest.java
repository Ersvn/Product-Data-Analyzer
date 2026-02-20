package com.example.pricecomparer.pricing.api;

import java.math.BigDecimal;

public record PricingQuoteRequest(
        String sku,
        BigDecimal cost,
        BigDecimal currentPrice,
        BigDecimal marketMin,
        BigDecimal marketMax,
        Integer competitorCount,
        BigDecimal basePrice
) {}
