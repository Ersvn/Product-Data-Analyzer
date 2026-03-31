package com.example.pricecomparer.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, Object> notFound(Exception e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", "NOT_FOUND");
        out.put("message", e.getMessage());
        return out;
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Map<String, Object> internal(Exception e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("error", e.getClass().getSimpleName());
        out.put("message", e.getMessage() == null ? "No message available" : e.getMessage());
        return out;
    }
}