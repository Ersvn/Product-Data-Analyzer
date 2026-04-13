//package com.example.pricecomparer.db;
//
//import tools.jackson.core.type.TypeReference;
//import tools.jackson.databind.ObjectMapper;
//import org.springframework.core.io.Resource;
//import org.springframework.core.io.ResourceLoader;
//import org.springframework.stereotype.Component;
//
//import java.io.InputStream;
//import java.nio.charset.Charset;
//import java.nio.charset.StandardCharsets;
//import java.util.Arrays;
//import java.util.List;
//import java.util.Map;
//
//@Component
//public class DbJsonImportReader {
//
//    private final ObjectMapper objectMapper;
//    private final ResourceLoader resourceLoader;
//
//    public DbJsonImportReader(ObjectMapper objectMapper, ResourceLoader resourceLoader) {
//        this.objectMapper = objectMapper;
//        this.resourceLoader = resourceLoader;
//    }
//
//    public List<Map<String, Object>> readJsonArray(String path) throws Exception {
//        Resource resource = resourceLoader.getResource(path);
//
//        try (InputStream in = resource.getInputStream()) {
//            byte[] bytes = in.readAllBytes();
//            Charset charset = detectCharsetFromBom(bytes);
//            String json = new String(stripBom(bytes), charset);
//            return objectMapper.readValue(json, new TypeReference<>() {});
//        }
//    }
//
//    private static Charset detectCharsetFromBom(byte[] bytes) {
//        if (bytes.length >= 2) {
//            int b0 = bytes[0] & 0xFF;
//            int b1 = bytes[1] & 0xFF;
//
//            if (b0 == 0xFF && b1 == 0xFE) return StandardCharsets.UTF_16LE;
//            if (b0 == 0xFE && b1 == 0xFF) return StandardCharsets.UTF_16BE;
//        }
//        return StandardCharsets.UTF_8;
//    }
//
//    private static byte[] stripBom(byte[] bytes) {
//        if (bytes.length >= 3) {
//            int b0 = bytes[0] & 0xFF;
//            int b1 = bytes[1] & 0xFF;
//            int b2 = bytes[2] & 0xFF;
//
//            if (b0 == 0xEF && b1 == 0xBB && b2 == 0xBF) {
//                return Arrays.copyOfRange(bytes, 3, bytes.length);
//            }
//        }
//
//        if (bytes.length >= 2) {
//            int b0 = bytes[0] & 0xFF;
//            int b1 = bytes[1] & 0xFF;
//
//            if ((b0 == 0xFF && b1 == 0xFE) || (b0 == 0xFE && b1 == 0xFF)) {
//                return Arrays.copyOfRange(bytes, 2, bytes.length);
//            }
//        }
//
//        return bytes;
//    }
//}