package com.example.pricing.rules;

import com.example.pricing.core.MarketSnapshot;
import com.example.pricing.core.PricingContext;
import com.example.pricing.core.PricingRule;
import com.example.pricing.core.RuleDecision;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static java.util.Objects.requireNonNull;

/**
 * Undercut marketMin med X% om vi har konkurrens.
 * requireCompetitors=true => competitorCount måste vara > 0.
 */
public class UndercutIfCompetitionRule implements PricingRule {

    private final BigDecimal undercutPercent;
    private final boolean requireCompetitors;
    private final int priority;

    public UndercutIfCompetitionRule(BigDecimal undercutPercent) {
        this(undercutPercent, true, 200);
    }

    public UndercutIfCompetitionRule(BigDecimal undercutPercent, boolean requireCompetitors) {
        this(undercutPercent, requireCompetitors, 200);
    }

    public UndercutIfCompetitionRule(BigDecimal undercutPercent, boolean requireCompetitors, int priority) {
        this.undercutPercent = requireNonNull(undercutPercent, "undercutPercent");
        this.requireCompetitors = requireCompetitors;
        this.priority = priority;
    }

    @Override
    public String id() {
        return "undercut_if_competition";
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public Optional<RuleDecision> evaluate(PricingContext ctx, BigDecimal workingPrice) {
        if (ctx == null) return Optional.empty();

        MarketSnapshot m = ctx.market();
        if (m == null) return Optional.empty();

        Integer competitors = m.competitorCount();
        if (requireCompetitors) {
            if (competitors == null || competitors <= 0) return Optional.empty();
        }

        BigDecimal marketMin = m.marketMin();
        if (marketMin == null) return Optional.empty();

        // newPrice = marketMin * (1 - undercutPercent)
        BigDecimal factor = BigDecimal.ONE.subtract(undercutPercent);
        BigDecimal newPrice = marketMin.multiply(factor);

        // safety
        if (newPrice.signum() < 0) return Optional.empty();

        newPrice = newPrice.setScale(2, RoundingMode.HALF_UP);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("marketMin", marketMin);
        meta.put("undercutPercent", undercutPercent);
        meta.put("competitorCount", competitors);
        meta.put("workingPriceBefore", workingPrice);

        return Optional.of(new RuleDecision(
                newPrice,
                "UNDERCUT_MARKET_MIN",
                meta
        ));
    }
}
