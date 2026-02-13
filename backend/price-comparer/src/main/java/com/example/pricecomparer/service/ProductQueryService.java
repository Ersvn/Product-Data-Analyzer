package com.example.pricecomparer.service;

import com.example.pricecomparer.domain.Product;
import com.example.pricecomparer.domain.QueryResult;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class ProductQueryService {

    public QueryResult<Product> query(List<Product> products, Map<String, String> q) {
        List<Product> result = new ArrayList<>(products);

        String search = lower(q.get("q"));
        if (!search.isBlank()) {
            result = result.stream().filter(p ->
                    contains(p.name, search) ||
                            contains(p.brand, search) ||
                            contains(p.category, search) ||
                            contains(p.store, search) ||
                            contains(p.ean, search)
            ).collect(Collectors.toList());
        }

        if (q.containsKey("brand")) {
            String b = q.get("brand");
            result = result.stream().filter(p -> Objects.equals(p.brand, b)).toList();
        }
        if (q.containsKey("category")) {
            String c = q.get("category");
            result = result.stream().filter(p -> Objects.equals(p.category, c)).toList();
        }
        if (q.containsKey("store")) {
            String s = q.get("store");
            result = result.stream().filter(p -> Objects.equals(p.store, s)).toList();
        }
        if (q.containsKey("ean")) {
            String e = q.get("ean");
            result = result.stream().filter(p -> Objects.equals(String.valueOf(p.ean), String.valueOf(e))).toList();
        }

        if (q.containsKey("minPrice")) {
            double min = toDouble(q.get("minPrice"));
            result = result.stream().filter(p -> p.price >= min).toList();
        }
        if (q.containsKey("maxPrice")) {
            double max = toDouble(q.get("maxPrice"));
            result = result.stream().filter(p -> p.price <= max).toList();
        }

        String sort = String.valueOf(q.getOrDefault("sort", ""));
        Comparator<Product> cmp = switch (sort) {
            case "price_asc" -> Comparator.comparingDouble(p -> p.price);
            case "price_desc" -> Comparator.comparingDouble((Product p) -> p.price).reversed();
            case "name_asc" -> Comparator.comparing(p -> String.valueOf(p.name), String.CASE_INSENSITIVE_ORDER);
            case "name_desc" -> Comparator.comparing((Product p) -> String.valueOf(p.name), String.CASE_INSENSITIVE_ORDER).reversed();
            default -> null;
        };
        if (cmp != null) result.sort(cmp);

        int page = Math.max(1, toInt(q.getOrDefault("page", "1"), 1));
        int limit = Math.max(1, Math.min(500, toInt(q.getOrDefault("limit", "50"), 50)));
        int start = (page - 1) * limit;

        List<Product> pageData = result.subList(Math.min(start, result.size()), Math.min(start + limit, result.size()));

        QueryResult<Product> out = new QueryResult<>();
        out.data = pageData;

        QueryResult.Meta meta = new QueryResult.Meta();
        meta.total = result.size();
        meta.page = page;
        meta.limit = limit;
        meta.totalPages = (int) Math.ceil(result.size() / (double) limit);
        out.meta = meta;

        return out;
    }

    private String lower(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT).trim(); }
    private boolean contains(String v, String needle) {
        if (v == null) return false;
        return v.toLowerCase(Locale.ROOT).contains(needle);
    }
    private double toDouble(String s) { try { return Double.parseDouble(s); } catch (Exception e) { return 0; } }
    private int toInt(String s, int fb) { try { return Integer.parseInt(s); } catch (Exception e) { return fb; } }
}