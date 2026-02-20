package com.example.pricecomparer.pricing;

import com.example.pricing.core.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Map;

@Service
public class PricingService {

    private final PricingStrategyEngine engine;

    public PricingService(PricingStrategyEngine engine) {
        this.engine = engine;
    }

    public PricingResult quote(
            String sku,
            BigDecimal cost,
            BigDecimal currentPrice,
            BigDecimal marketMin,
            BigDecimal marketMax,
            Integer competitorCount,
            BigDecimal basePrice
    ) {

        var market = new MarketSnapshot(marketMin, marketMax, competitorCount);

        var ctx = new PricingContext(
                sku,
                cost,
                currentPrice,
                market,
                Map.of()
        );

        BigDecimal base = basePrice != null
                ? basePrice
                : currentPrice != null
                ? currentPrice
                : cost != null
                ? cost
                : BigDecimal.ZERO;

        return engine.price(ctx, base);
    }
}
