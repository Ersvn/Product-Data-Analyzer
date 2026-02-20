package com.example.pricing.core;

import java.math.BigDecimal;

public record MarketSnapshot(
        BigDecimal marketMin,
        BigDecimal marketMax,
        Integer competitorCount
) {}
