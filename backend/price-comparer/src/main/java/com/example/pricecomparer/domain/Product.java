package com.example.pricecomparer.domain;

import com.sun.jdi.LongValue;

public class Product {

    public long id;
    public String name;
    public String brand;
    public String category;
    public double price;
    public String store;
    public String mpn;
    public String companySku;
    public String url;
    public String ean;
    public Double costPrice;
    public Long matchedProductId;
    public Double priceMin;
    public Double priceMax;
    public Double priceMedian;
    public Double benchmarkPrice;
    public Double ourPrice;
    public Integer offersCount;
    public String lastUpdated;
    public String imageUrl;
    public PriceMode priceMode = PriceMode.AUTO;
    public Double manualPrice;
    public Double recommendedPrice;

    public Product() {}

    public PriceMode getPriceMode() {
        return priceMode == null ? PriceMode.AUTO : priceMode;
    }

    public Double getEffectivePrice() {
        if (getPriceMode() == PriceMode.MANUAL && manualPrice != null) {
            return manualPrice;
        }
        return recommendedPrice;
    }

    public boolean isManual() {
        return getPriceMode() == PriceMode.MANUAL;
    }
}
