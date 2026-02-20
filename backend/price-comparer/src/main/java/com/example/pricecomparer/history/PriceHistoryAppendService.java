package com.example.pricecomparer.history;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.io.JsonlFileAppender;
import com.example.pricecomparer.service.DataStoreService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class PriceHistoryAppendService {

    private final JsonlFileAppender appender;
    private final DataStoreService store;

    @Value("${app.data.historyPath:file:./data/price-history.jsonl}")
    private String historyPath;

    public PriceHistoryAppendService(JsonlFileAppender appender, DataStoreService store) {
        this.appender = appender;
        this.store = store;
    }

    /**
     * Loggar EN rad i jsonl varje gång pris-state ändras.
     */
    public void append(String reason, Product before, Product after) {
        if (after == null) return;

        Map<String, Object> e = new LinkedHashMap<>();
        e.put("ts", Instant.now().toString());
        e.put("reason", reason);

        e.put("productId", after.id);
        e.put("ean", after.ean);

        // before snapshot (om vi har)
        if (before != null) {
            e.put("beforePriceMode", before.getPriceMode() == null ? null : before.getPriceMode().name());
            e.put("beforeManualPrice", before.manualPrice);
            e.put("beforeRecommendedPrice", before.recommendedPrice);
            e.put("beforeEffectivePrice", store.getEffectivePrice(before));
        }

        // after snapshot
        e.put("priceMode", after.getPriceMode() == null ? null : after.getPriceMode().name());
        e.put("manualPrice", after.manualPrice);
        e.put("recommendedPrice", after.recommendedPrice);
        e.put("effectivePrice", store.getEffectivePrice(after));
        e.put("lastUpdated", after.lastUpdated);

        appender.append(historyPath, e);
    }
}
