//package com.example.pricecomparer.service.prices;
//
//import com.fasterxml.jackson.databind.JsonNode;
//import com.fasterxml.jackson.databind.ObjectMapper;
//import org.springframework.http.HttpHeaders;
//import org.springframework.stereotype.Component;
//import org.springframework.web.client.RestClient;
//
//@Component
//public class PricesApiClient {
//
//    private final RestClient http;
//    private final ObjectMapper om = new ObjectMapper();
//    private final PricesApiProperties props;
//
//    public PricesApiClient(PricesApiProperties props) {
//        this.props = props;
//
//        RestClient.Builder b = RestClient.builder()
//                .baseUrl(props.getBaseUrl())
//                .defaultHeader(HttpHeaders.ACCEPT, "application/json");
//
//        if ("header".equalsIgnoreCase(props.getAuthMode())) {
//            b = b.defaultHeader("x-api-key", props.getApiKey());
//        }
//
//        this.http = b.build();
//    }
//
//    public JsonNode search(String query, int limit) {
//        String body = http.get()
//                .uri(uri -> {
//                    var u = uri.path("/products/search")
//                            .queryParam("q", query)
//                            .queryParam("limit", limit);
//                    if ("query".equalsIgnoreCase(props.getAuthMode())) {
//                        u = u.queryParam("api_key", props.getApiKey());
//                    }
//                    return u.build();
//                })
//                .retrieve()
//                .body(String.class);
//
//        try { return om.readTree(body); }
//        catch (Exception e) { throw new RuntimeException("PricesAPI search parse failed: " + e.getMessage(), e); }
//    }
//
//    public JsonNode offers(String productId, String country) {
//        String body = http.get()
//                .uri(uri -> {
//                    var u = uri.path("/products/{id}/offers")
//                            .queryParam("country", country);
//                    if ("query".equalsIgnoreCase(props.getAuthMode())) {
//                        u = u.queryParam("api_key", props.getApiKey());
//                    }
//                    return u.build(productId);
//                })
//                .retrieve()
//                .body(String.class);
//
//        try { return om.readTree(body); }
//        catch (Exception e) { throw new RuntimeException("PricesAPI offers parse failed: " + e.getMessage(), e); }
//    }
//
//    public String country() { return props.getCountry(); }
//    public int cacheTtlHours() { return props.getCacheTtlHours(); }
//}
