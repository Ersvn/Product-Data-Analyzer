package com.example.pricecomparer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PriceComparerApplication {
    public static void main(String[] args) {
        SpringApplication.run(PriceComparerApplication.class, args);
    }
}
