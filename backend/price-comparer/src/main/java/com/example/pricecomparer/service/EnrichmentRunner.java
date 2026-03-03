package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.Product;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.List;

@Component
public class EnrichmentRunner implements ApplicationRunner {

    private final DataStoreService store;
    private final EnrichmentService enricher;
    private final ObjectMapper om = new ObjectMapper();

    @Value("${enrichment.runOnStartup:false}")
    private boolean runOnStartup;

    @Value("${enrichment.enabled:false}")
    private boolean enrichmentEnabled;

    @Value("${app.data.marketPath}")
    private String marketPath;

    @Value("${app.data.companyPath}")
    private String companyPath;

    @Value("${app.data.enrichedMarketPath:}")
    private String enrichedMarketPath;

    public EnrichmentRunner(DataStoreService store, EnrichmentService enricher) {
        this.store = store;
        this.enricher = enricher;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!runOnStartup) {
            System.out.println("[ENRICH] runOnStartup=false (skip)");
            return;
        }
        if (!enrichmentEnabled || !enricher.isEnabled()) {
            System.out.println("[ENRICH] enrichment disabled (skip)");
            return;
        }
        if (enrichedMarketPath == null || enrichedMarketPath.isBlank()) {
            System.out.println("[ENRICH] enrichedMarketPath missing (skip)");
            return;
        }

        // Ladda base (utan enriched)
        store.loadAll(marketPath, companyPath, "", false);

        // Berika market
        List<Product> base = store.market();
        List<Product> enriched = enricher.enrich(base);

        // Skriv enriched till disk
        writeToFileLocation(enrichedMarketPath, enriched);

        // Ladda om och använd enriched som market source
        store.loadAll(marketPath, companyPath, enrichedMarketPath, true);

        System.out.println("[ENRICH] enriched market written to " + enrichedMarketPath);
    }

    private void writeToFileLocation(String location, List<Product> products) throws Exception {
        String pathStr = location.startsWith("file:") ? location.substring("file:".length()) : location;
        Path p = Path.of(pathStr).normalize();

        if (p.getParent() != null) Files.createDirectories(p.getParent());
        Files.writeString(p, om.writerWithDefaultPrettyPrinter().writeValueAsString(products));
    }
}
