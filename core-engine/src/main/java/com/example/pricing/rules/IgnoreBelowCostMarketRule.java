package com.example.pricing.rules;

import com.example.pricing.core.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

public final class IgnoreBelowCostMarketRule implements PricingRule {

    @Override public String id() { return "ignore_market_below_cost"; }
    @Override public int priority() { return 10; }

    @Override
    public Optional<RuleDecision> evaluate(PricingContext ctx, BigDecimal workingPrice) {
        var m = ctx.market();
        if (m == null || m.marketMin() == null || ctx.cost() == null) return Optional.empty();

        if (m.marketMin().compareTo(ctx.cost()) < 0) {
            return Optional.of(new RuleDecision(
                    workingPrice,
                    "ignore_market_min_below_cost",
                    Map.of("marketMin", m.marketMin(), "cost", ctx.cost())
            ));
        }
        return Optional.empty();
    }
}
