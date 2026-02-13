package com.example.pricecomparer.domain;

import java.util.List;
import java.util.Map;

public class CompareResponse {
    public Map<String, Object> meta;
    public List<Matched> matched;
    public List<Product> onlyInMarket;
    public List<Product> onlyInCompany;

    public static class Matched {
        public String ean;
        public Product market;
        public Product company;
        public double priceDiff;

        public Matched() {}

        public Matched(String ean, Product market, Product company, double priceDiff) {
            this.ean = ean;
            this.market = market;
            this.company = company;
            this.priceDiff = priceDiff;
        }
    }
}