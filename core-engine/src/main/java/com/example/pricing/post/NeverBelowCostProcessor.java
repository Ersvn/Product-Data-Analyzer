package com.example.pricing.post;

import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingStrategyEngine;
import com.example.pricing.core.RuleHit;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

public final class NeverBelowCostProcessor implements PricingStrategyEngine.PricePostProcessor {

    @Override
    public BigDecimal apply(PricingContext ctx, BigDecimal price, List<RuleHit> hits) {
        if (price == null) return null;
        if (ctx == null || ctx.cost() == null) return price;

        BigDecimal cost = ctx.cost().setScale(2, RoundingMode.HALF_UP);

        if (price.compareTo(cost) < 0) {
            BigDecimal adjusted = cost;

            hits.add(new RuleHit(
                    "NeverBelowCostProcessor",
                    "floor_to_cost",
                    Map.of(
                            "originalPrice", price,
                            "adjustedPrice", adjusted,
                            "cost", cost
                    )
            ));

            return adjusted;
        }

        return price;
    }
}