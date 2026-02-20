package com.example.pricecomparer.pricing.api;

import com.example.pricing.core.RuleHit;
import java.math.BigDecimal;
import java.util.List;

public record PricingQuoteResponse(
        String sku,
        BigDecimal basePrice,
        BigDecimal finalPrice,
        List<RuleHit> ruleHits
) {}
