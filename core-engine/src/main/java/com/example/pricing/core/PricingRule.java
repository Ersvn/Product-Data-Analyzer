package com.example.pricing.core;

import java.math.BigDecimal;
import java.util.Optional;

public interface PricingRule {
    String id();
    int priority();

    Optional<RuleDecision> evaluate(PricingContext ctx, BigDecimal workingPrice);
}
