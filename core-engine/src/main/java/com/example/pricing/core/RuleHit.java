package com.example.pricing.core;

import java.util.Map;

public record RuleHit(
        String ruleId,
        String action,
        Map<String, Object> meta
) {}
