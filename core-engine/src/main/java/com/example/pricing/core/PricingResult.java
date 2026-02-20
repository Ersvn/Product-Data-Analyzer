package com.example.pricing.core;

import java.math.BigDecimal;
import java.util.List;

public record PricingResult(
        BigDecimal finalPrice,
        BigDecimal basePrice,
        List<RuleHit> ruleHits
) {}
