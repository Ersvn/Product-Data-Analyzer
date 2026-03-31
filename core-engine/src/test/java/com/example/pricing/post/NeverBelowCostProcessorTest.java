package com.example.pricing.post;

import com.example.pricing.core.MarketSnapshot;
import com.example.pricing.core.PricingContext;
import com.example.pricing.core.RuleHit;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class NeverBelowCostProcessorTest {

    @Test
    void raises_price_to_cost_when_price_is_below_cost() {
        PricingContext ctx = new PricingContext(
                "TEST-1",
                new BigDecimal("100.00"),
                new BigDecimal("110.00"),
                new MarketSnapshot(
                        new BigDecimal("80.00"),
                        new BigDecimal("90.00"),
                        5
                ),
                Map.of()
        );

        NeverBelowCostProcessor processor = new NeverBelowCostProcessor();
        List<RuleHit> hits = new ArrayList<>();

        BigDecimal out = processor.apply(ctx, new BigDecimal("85.00"), hits);

        assertEquals(new BigDecimal("100.00"), out);
        assertEquals(1, hits.size());
        assertEquals("floor_to_cost", hits.get(0).action());
    }

    @Test
    void leaves_price_unchanged_when_price_is_already_above_cost() {
        PricingContext ctx = new PricingContext(
                "TEST-2",
                new BigDecimal("100.00"),
                new BigDecimal("110.00"),
                new MarketSnapshot(
                        new BigDecimal("120.00"),
                        new BigDecimal("130.00"),
                        3
                ),
                Map.of()
        );

        NeverBelowCostProcessor processor = new NeverBelowCostProcessor();
        List<RuleHit> hits = new ArrayList<>();

        BigDecimal out = processor.apply(ctx, new BigDecimal("105.00"), hits);

        assertEquals(new BigDecimal("105.00"), out);
        assertTrue(hits.isEmpty());
    }
}