package com.example.pricecomparer.service.prices;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "pricesapi")
public class PricesApiProperties {
    private String baseUrl;
    private String apiKey;
    private String country;
    private int cacheTtlHours = 24;
    private String authMode = "header"; // header | query

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public int getCacheTtlHours() { return cacheTtlHours; }
    public void setCacheTtlHours(int cacheTtlHours) { this.cacheTtlHours = cacheTtlHours; }

    public String getAuthMode() { return authMode; }
    public void setAuthMode(String authMode) { this.authMode = authMode; }
}
