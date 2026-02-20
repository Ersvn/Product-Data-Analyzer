package com.example.pricing.core;

import java.math.BigDecimal;
import java.util.*;

import static java.util.Objects.requireNonNull;

public final class PricingStrategyEngine {

    public enum Mode { FIRST_MATCH_WINS, APPLY_ALL }

    public interface PricePostProcessor {
        BigDecimal apply(PricingContext ctx, BigDecimal price, List<RuleHit> hits);
        default String id() { return getClass().getSimpleName(); }
    }

    private final List<PricingRule> rules;
    private final List<PricePostProcessor> postProcessors;
    private final Mode mode;

    public PricingStrategyEngine(List<PricingRule> rules,
                                 List<PricePostProcessor> postProcessors,
                                 Mode mode) {
        requireNonNull(rules);
        requireNonNull(postProcessors);
        this.mode = requireNonNull(mode);

        this.rules = rules.stream()
                .sorted(Comparator.comparingInt(PricingRule::priority))
                .toList();

        this.postProcessors = List.copyOf(postProcessors);
    }

    public PricingResult price(PricingContext ctx, BigDecimal basePrice) {
        requireNonNull(ctx);
        BigDecimal working = requireNonNull(basePrice);

        var hits = new ArrayList<RuleHit>();

        for (PricingRule rule : rules) {
            var decisionOpt = rule.evaluate(ctx, working);
            if (decisionOpt.isEmpty()) continue;

            var decision = decisionOpt.get();
            working = requireNonNull(decision.newPrice());

            hits.add(new RuleHit(
                    rule.id(),
                    decision.action(),
                    decision.meta() == null ? Map.of() : Map.copyOf(decision.meta())
            ));

            if (mode == Mode.FIRST_MATCH_WINS) break;
        }

        for (var pp : postProcessors) {
            working = requireNonNull(pp.apply(ctx, working, hits));
        }

        return new PricingResult(working, basePrice, List.copyOf(hits));
    }
}
