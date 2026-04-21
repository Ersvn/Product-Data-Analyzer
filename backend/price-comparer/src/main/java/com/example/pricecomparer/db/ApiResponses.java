package com.example.pricecomparer.db;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ApiResponses {

    private ApiResponses() {
    }

    public static Map<String, Object> ok() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    public static Map<String, Object> ok(String key, Object value) {
        Map<String, Object> out = ok();
        out.put(key, value);
        return out;
    }

    public static Map<String, Object> ok(Map<String, Object> additions) {
        Map<String, Object> out = ok();
        out.putAll(additions);
        return out;
    }

    public static Map<String, Object> error(String code, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("error", code);
        out.put("message", message);
        return out;
    }
}