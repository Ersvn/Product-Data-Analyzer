package com.example.pricing.rules;

import com.example.pricing.core.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

import static java.util.Objects.requireNonNull;

public final class SoloMarketPremiumRule implements PricingRule {

    private final BigDecimal factor; // e.g. 0.98 * marketMax

    public SoloMarketPremiumRule(BigDecimal factor) {
        this.factor = requireNonNull(factor);
    }

    @Override public String id() { return "solo_market_premium"; }
    @Override public int priority() { return 200; }

    @Override
    public Optional<RuleDecision> evaluate(PricingContext ctx, BigDecimal workingPrice) {
        var m = ctx.market();
        if (m == null || m.competitorCount() == null) return Optional.empty();
        if (m.competitorCount() != 0) return Optional.empty();
        if (m.marketMax() == null) return Optional.empty();

        var newPrice = m.marketMax().multiply(factor);

        return Optional.of(new RuleDecision(
                newPrice,
                "premium_when_alone",
                Map.of("marketMax", m.marketMax(), "factor", factor)
        ));
    }
}
