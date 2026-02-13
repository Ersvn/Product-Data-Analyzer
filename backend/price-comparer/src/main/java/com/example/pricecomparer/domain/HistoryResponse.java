package com.example.pricecomparer.domain;

import java.util.List;
import java.util.Map;

public class HistoryResponse {
    public Map<String, Object> meta;
    public List<PricePoint> data;

    public HistoryResponse() {}
}