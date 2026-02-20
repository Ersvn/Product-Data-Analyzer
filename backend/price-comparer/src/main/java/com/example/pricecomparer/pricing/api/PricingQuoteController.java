package com.example.pricecomparer.pricing.api;

import com.example.pricecomparer.pricing.PricingService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pricing")
public class PricingQuoteController {

    private final PricingService pricingService;

    public PricingQuoteController(PricingService pricingService) {
        this.pricingService = pricingService;
    }

    @PostMapping("/quote")
    public ResponseEntity<PricingQuoteResponse> quote(@RequestBody PricingQuoteRequest req) {

        var result = pricingService.quote(
                req.sku(),
                req.cost(),
                req.currentPrice(),
                req.marketMin(),
                req.marketMax(),
                req.competitorCount(),
                req.basePrice()
        );

        return ResponseEntity.ok(
                new PricingQuoteResponse(
                        req.sku(),
                        result.basePrice(),
                        result.finalPrice(),
                        result.ruleHits()
                )
        );
    }
}
