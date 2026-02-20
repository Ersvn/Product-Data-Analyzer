package com.example.pricecomparer.web.dto;

public record PatchCompanyProductRequest(
        String name,
        String ean,
        String brand,
        String category,
        String store,
        String imageUrl,
        String url
) {}
