package com.example.pricing.core;

import java.math.BigDecimal;
import java.util.Map;

public record PricingContext(
        String sku,
        BigDecimal cost,
        BigDecimal currentPrice,
        MarketSnapshot market,
        Map<String, Object> attributes
) {
    public PricingContext {
        attributes = (attributes == null) ? Map.of() : Map.copyOf(attributes);
    }
}
