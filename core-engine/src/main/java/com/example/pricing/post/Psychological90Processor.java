package com.example.pricing.post;

import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingStrategyEngine;
import com.example.pricing.core.RuleHit;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

public final class Psychological90Processor implements PricingStrategyEngine.PricePostProcessor {

    private final BigDecimal cents; // 0.90

    public Psychological90Processor() {
        this(new BigDecimal("0.90"));
    }

    public Psychological90Processor(BigDecimal cents) {
        this.cents = cents;
    }

    @Override
    public BigDecimal apply(PricingContext ctx, BigDecimal price, List<RuleHit> hits) {
        if (price == null) return null;

        // Ensure 2 decimals
        var p = price.setScale(2, RoundingMode.HALF_UP);

        // Floor to integer part and add .90 (avoid increasing above original by rounding)
        var floor = p.setScale(0, RoundingMode.FLOOR);
        var adjusted = floor.add(cents).setScale(2, RoundingMode.HALF_UP);

        // If adjusted is greater than original (e.g. price = 10.10 -> floor+0.90=10.90), step down 1
        if (adjusted.compareTo(p) > 0) {
            adjusted = floor.subtract(BigDecimal.ONE).add(cents).setScale(2, RoundingMode.HALF_UP);
        }

        // Guard: never go negative
        if (adjusted.compareTo(BigDecimal.ZERO) < 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }

        return adjusted;
    }
}
