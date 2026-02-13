package com.example.pricecomparer.domain;

import java.util.List;

public class CompareHistoryResponse {
    public String ean;
    public List<PricePoint> market;
    public List<PricePoint> company;

    public CompareHistoryResponse() {}
}