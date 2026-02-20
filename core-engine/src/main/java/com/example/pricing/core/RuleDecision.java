package com.example.pricing.core;

import java.math.BigDecimal;
import java.util.Map;

public record RuleDecision(
        BigDecimal newPrice,
        String action,
        Map<String, Object> meta
) {}
