package com.example.pricecomparer.web.dto;

import com.example.pricecomparer.domain.PriceMode;

public record CreateCompanyProductRequest(
        String name,
        String ean,
        String brand,
        String category,
        String store,
        String imageUrl,
        String url,
        Double ourPrice,
        Double price,
        PriceMode priceMode,
        Double manualPrice,
        Double recommendedPrice
) {}
