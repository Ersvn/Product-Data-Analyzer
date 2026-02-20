package com.example.pricecomparer.web.dto;

import com.example.pricecomparer.domain.PriceMode;

public class UpdatePricingRequest {

    private PriceMode priceMode;

    private boolean manualPriceSet;
    private Double manualPrice;

    private boolean ourPriceSet;
    private Double ourPrice;

    private boolean recommendedPriceSet;
    private Double recommendedPrice;

    // --- priceMode ---
    public PriceMode getPriceMode() { return priceMode; }
    public void setPriceMode(PriceMode priceMode) { this.priceMode = priceMode; }

    // --- manualPrice ---
    public boolean isManualPriceSet() { return manualPriceSet; }
    public Double getManualPrice() { return manualPrice; }
    public void setManualPrice(Double manualPrice) {
        this.manualPriceSet = true;
        this.manualPrice = manualPrice; // kan vara null => clear
    }

    // --- ourPrice ---
    public boolean isOurPriceSet() { return ourPriceSet; }
    public Double getOurPrice() { return ourPrice; }
    public void setOurPrice(Double ourPrice) {
        this.ourPriceSet = true;
        this.ourPrice = ourPrice; // kan vara null => clear
    }

    // --- recommendedPrice ---
    public boolean isRecommendedPriceSet() { return recommendedPriceSet; }
    public Double getRecommendedPrice() { return recommendedPrice; }
    public void setRecommendedPrice(Double recommendedPrice) {
        this.recommendedPriceSet = true;
        this.recommendedPrice = recommendedPrice; // kan vara null => clear
    }
}
