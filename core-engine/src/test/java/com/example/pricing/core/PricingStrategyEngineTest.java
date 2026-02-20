package com.example.pricing.core;

import com.example.pricing.post.Psychological90Processor;
import com.example.pricing.rules.IgnoreBelowCostMarketRule;
import com.example.pricing.rules.SoloMarketPremiumRule;
import com.example.pricing.rules.UndercutIfCompetitionRule;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PricingStrategyEngineTest {

    @Test
    void undercuts_when_competitors_exist() {
        var engine = new PricingStrategyEngine(
                List.of(
                        new IgnoreBelowCostMarketRule(),
                        new UndercutIfCompetitionRule(new BigDecimal("0.01")),
                        new SoloMarketPremiumRule(new BigDecimal("0.98"))
                ),
                List.of(new Psychological90Processor()),
                PricingStrategyEngine.Mode.FIRST_MATCH_WINS
        );

        var ctx = new PricingContext(
                "SKU1",
                new BigDecimal("50.00"),
                new BigDecimal("79.00"),
                new MarketSnapshot(new BigDecimal("100.00"), new BigDecimal("140.00"), 5),
                Map.of()
        );

        var r = engine.price(ctx, new BigDecimal("120.00"));
        assertNotNull(r.finalPrice());
        assertTrue(r.finalPrice().compareTo(new BigDecimal("99.00")) <= 0); // 100*0.99 => 99.00 then psych => 98.90
        assertFalse(r.ruleHits().isEmpty());
        assertEquals("undercut_if_competition", r.ruleHits().get(0).ruleId());
    }

    @Test
    void premiums_when_alone() {
        var engine = new PricingStrategyEngine(
                List.of(
                        new SoloMarketPremiumRule(new BigDecimal("0.98"))
                ),
                List.of(),
                PricingStrategyEngine.Mode.FIRST_MATCH_WINS
        );

        var ctx = new PricingContext(
                "SKU2",
                new BigDecimal("50.00"),
                new BigDecimal("79.00"),
                new MarketSnapshot(new BigDecimal("100.00"), new BigDecimal("200.00"), 0),
                Map.of()
        );

        var r = engine.price(ctx, new BigDecimal("120.00"));
        assertEquals(new BigDecimal("196.00"), r.finalPrice().setScale(2));
        assertEquals("solo_market_premium", r.ruleHits().get(0).ruleId());
    }

    @Test
    void ignores_market_min_below_cost() {
        var engine = new PricingStrategyEngine(
                List.of(
                        new IgnoreBelowCostMarketRule(),
                        new UndercutIfCompetitionRule(new BigDecimal("0.05"))
                ),
                List.of(),
                PricingStrategyEngine.Mode.APPLY_ALL
        );

        var ctx = new PricingContext(
                "SKU3",
                new BigDecimal("100.00"),
                new BigDecimal("110.00"),
                new MarketSnapshot(new BigDecimal("80.00"), new BigDecimal("140.00"), 10),
                Map.of()
        );

        var r = engine.price(ctx, new BigDecimal("120.00"));
        // IgnoreBelowCostMarketRule returns workingPrice unchanged; APPLY_ALL then undercut would still run.
        // This test verifies rule hit exists; next step in phase 1b is to add "marketMinEligible" flag to context/attrs.
        assertTrue(r.ruleHits().stream().anyMatch(h -> h.ruleId().equals("ignore_market_below_cost")));
    }

    @Test
    void psychological_90_does_not_increase_price() {
        var pp = new Psychological90Processor();
        var ctx = new PricingContext("SKU4", null, null, null, Map.of());

        assertEquals(new BigDecimal("9.90"), pp.apply(ctx, new BigDecimal("10.10"), List.of()).setScale(2));
        assertEquals(new BigDecimal("10.90"), pp.apply(ctx, new BigDecimal("10.99"), List.of()).setScale(2));
        assertEquals(new BigDecimal("0.00"), pp.apply(ctx, new BigDecimal("0.10"), List.of()).setScale(2));
    }
}
