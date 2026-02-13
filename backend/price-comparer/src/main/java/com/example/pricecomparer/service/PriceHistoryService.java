package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.PricePoint;
import com.example.pricecomparer.domain.Product;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PriceHistoryService {

    private final DataStoreService store;
    private final ResourceLoader resourceLoader;
    private final ObjectMapper om = new ObjectMapper();

    // Valfri fil: src/main/resources/data/price-history.json
    @Value("${app.data.historyPath:classpath:data/price-history.json}")
    private String historyPath;

    public PriceHistoryService(DataStoreService store, ResourceLoader resourceLoader) {
        this.store = store;
        this.resourceLoader = resourceLoader;
    }

    public List<PricePoint> getHistory(String ean, String source, LocalDate from, LocalDate to, int limit) {
        String nean = normalizeDigits(ean);

        List<PricePoint> fromFile = tryReadFromFile(nean, source);
        if (!fromFile.isEmpty()) {
            return filterRange(fromFile, from, to, limit);
        }

        double base = getCurrentPrice(nean, source);
        if (base <= 0) return List.of();

        List<PricePoint> generated = generate(nean, source, base, from, to);
        return filterRange(generated, from, to, limit);
    }

    public Map<String, List<PricePoint>> getCompareHistory(String ean, LocalDate from, LocalDate to, int limit) {
        String nean = normalizeDigits(ean);
        List<PricePoint> m = getHistory(nean, "market", from, to, limit);
        List<PricePoint> c = getHistory(nean, "company", from, to, limit);
        return Map.of("market", m, "company", c);
    }

    private List<PricePoint> tryReadFromFile(String ean, String source) {
        try {
            Resource r = resourceLoader.getResource(historyPath);
            if (!r.exists()) return List.of();

            List<PricePoint> all = om.readValue(r.getInputStream(), new TypeReference<List<PricePoint>>() {});
            return all.stream()
                    .filter(p -> normalizeDigits(p.ean).equals(ean))
                    .filter(p -> source == null || source.isBlank() || String.valueOf(p.source).equalsIgnoreCase(source))
                    .map(p -> {
                        // säkra fält
                        p.ean = normalizeDigits(p.ean);
                        p.source = p.source == null ? "" : p.source.toLowerCase(Locale.ROOT);
                        if (p.currency == null || p.currency.isBlank()) p.currency = "SEK";
                        return p;
                    })
                    .collect(Collectors.toList());
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private double getCurrentPrice(String ean, String source) {
        Map<String, Product> idx = source.equalsIgnoreCase("company") ? store.companyIndex() : store.marketIndex();
        Product p = idx.get(ean);
        return p == null ? 0 : p.price;
    }

    private List<PricePoint> generate(String ean, String source, double base, LocalDate from, LocalDate to) {
        // Realistisk, enkel generator:
        //  - datapunkt per dag
        //  - veckovis drift +-1–2%
        //  - ibland kampanj-drop
        Random rnd = new Random(Objects.hash(ean, source));
        List<PricePoint> out = new ArrayList<>();

        LocalDate start = from;
        LocalDate end = to;

        double price = base;

        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            // mild daily noise
            double daily = 1.0 + (rnd.nextDouble() - 0.5) * 0.004; // +/-0.2%
            price *= daily;

            // varje måndag: större justering
            if (d.getDayOfWeek().getValue() == 1) {
                double weekly = 1.0 + (rnd.nextDouble() - 0.5) * 0.04; // +/-2%
                price *= weekly;
            }

            // ibland kampanj (ca 1% av dagar)
            if (rnd.nextDouble() < 0.01) {
                price *= 0.92; // -8%
            }

            PricePoint p = new PricePoint();
            p.ean = ean;
            p.source = source.toLowerCase(Locale.ROOT);
            p.currency = "SEK";
            p.price = Math.max(1, Math.round(price)); // avrunda kr
            p.ts = d.atStartOfDay().toInstant(ZoneOffset.UTC).toString();

            out.add(p);
        }

        // sortera stigande tid
        out.sort(Comparator.comparing(x -> Instant.parse(x.ts)));
        return out;
    }

    private List<PricePoint> filterRange(List<PricePoint> points, LocalDate from, LocalDate to, int limit) {
        return points.stream()
                .filter(p -> {
                    try {
                        Instant ts = Instant.parse(p.ts);
                        LocalDate d = ts.atZone(ZoneOffset.UTC).toLocalDate();
                        return (d.isEqual(from) || d.isAfter(from)) && (d.isEqual(to) || d.isBefore(to));
                    } catch (Exception e) {
                        return false;
                    }
                })
                .sorted(Comparator.comparing(p -> Instant.parse(p.ts)))
                .limit(limit)
                .collect(Collectors.toList());
    }

    private String normalizeDigits(String s) {
        if (s == null) return "";
        return s.trim().replaceAll("\\D", "");
    }
}