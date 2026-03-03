package com.example.pricecomparer.service.icecat;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.w3c.dom.*;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class IcecatImageService {

    private final ResourceLoader resourceLoader;

    @Value("${icecat.enabled:false}")
    private boolean enabled;

    @Value("${icecat.path:}")
    private String path;

    @Value("${icecat.prefer:high}")
    private String prefer;

    // cache
    private final AtomicReference<Map<String, String>> cache = new AtomicReference<>(Map.of());
    private final AtomicReference<String> cachedFrom = new AtomicReference<>("");
    private final AtomicReference<Long> cachedMtime = new AtomicReference<>(-1L);

    public IcecatImageService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    public boolean isEnabled() {
        return enabled && path != null && !path.isBlank();
    }

    public String findImageUrlByEan(String ean) {
        if (!isEnabled()) return null;
        String key = digitsOnly(ean);
        if (key.isBlank()) return null;
        return ensureIndexLoaded().get(key);
    }

    public int indexSize() {
        return ensureIndexLoaded().size();
    }

    private Map<String, String> ensureIndexLoaded() {
        if (!isEnabled()) return Map.of();

        String currentPath = path;
        long mtime = getMtimeIfFile(currentPath);

        Map<String, String> existing = cache.get();
        String from = cachedFrom.get();
        long prevMtime = cachedMtime.get();

        if (!existing.isEmpty() && Objects.equals(from, currentPath) && (mtime < 0 || mtime == prevMtime)) {
            return existing;
        }

        synchronized (this) {
            existing = cache.get();
            from = cachedFrom.get();
            prevMtime = cachedMtime.get();

            if (!existing.isEmpty() && Objects.equals(from, currentPath) && (mtime < 0 || mtime == prevMtime)) {
                return existing;
            }

            Map<String, String> built = buildIndexFromDailyIndex(currentPath);

            cache.set(Collections.unmodifiableMap(built));
            cachedFrom.set(currentPath);
            cachedMtime.set(mtime);

            System.out.printf("[ICECAT] indexed ean->image count=%d from %s%n", built.size(), currentPath);
            return cache.get();
        }
    }

    private long getMtimeIfFile(String location) {
        try {
            if (location == null) return -1L;
            if (!location.startsWith("file:")) return -1L;
            String pathStr = location.substring("file:".length());
            Path p = Path.of(pathStr).normalize();
            if (!Files.exists(p)) return -1L;
            return Files.getLastModifiedTime(p).toMillis();
        } catch (Exception e) {
            return -1L;
        }
    }

    private Map<String, String> buildIndexFromDailyIndex(String location) {
        Map<String, String> out = new HashMap<>();

        try {
            Resource r = resourceLoader.getResource(location);
            if (!r.exists()) return out;

            try (InputStream in = r.getInputStream()) {

                var dbf = DocumentBuilderFactory.newInstance();
                dbf.setNamespaceAware(false);

                try { dbf.setFeature("http://xml.org/sax/features/external-general-entities", false); } catch (Exception ignored) {}
                try { dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false); } catch (Exception ignored) {}
                try { dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false); } catch (Exception ignored) {}
                try { dbf.setXIncludeAware(false); } catch (Exception ignored) {}
                try { dbf.setExpandEntityReferences(false); } catch (Exception ignored) {}

                Document doc = dbf.newDocumentBuilder().parse(in);
                doc.getDocumentElement().normalize();

                NodeList files = doc.getElementsByTagName("file");
                for (int i = 0; i < files.getLength(); i++) {
                    Node n = files.item(i);
                    if (!(n instanceof Element fileEl)) continue;

                    String img = pickImageAttr(fileEl);
                    if (img.isBlank()) continue;

                    String ean13 = findFirstGtin13(fileEl);
                    if (ean13.isBlank()) continue;

                    out.putIfAbsent(ean13, img);
                }
            }
        } catch (Exception e) {
            System.out.println("[ICECAT] failed to parse: " + e.getMessage());
        }

        return out;
    }

    private String pickImageAttr(Element fileEl) {
        String pref = (prefer == null ? "high" : prefer.trim().toLowerCase(Locale.ROOT));

        List<String> keys = switch (pref) {
            case "pic500x500" -> List.of("Pic500x500", "HighPic", "LowPic", "ThumbPic");
            case "low" -> List.of("LowPic", "HighPic", "ThumbPic", "Pic500x500");
            case "thumb" -> List.of("ThumbPic", "LowPic", "HighPic", "Pic500x500");
            default -> List.of("HighPic", "Pic500x500", "LowPic", "ThumbPic");
        };

        for (String k : keys) {
            String v = fileEl.getAttribute(k);
            if (v != null && !v.isBlank()) return v.trim();
        }
        return "";
    }

    private String findFirstGtin13(Element fileEl) {
        NodeList eans = fileEl.getElementsByTagName("EAN_UPC");

        for (int j = 0; j < eans.getLength(); j++) {
            Node n = eans.item(j);
            if (!(n instanceof Element e)) continue;

            String format = safe(e.getAttribute("Format")).toUpperCase(Locale.ROOT);
            String val = digitsOnly(e.getAttribute("Value"));

            if ("GTIN-13".equals(format) && val.length() == 13) return val;
        }

        for (int j = 0; j < eans.getLength(); j++) {
            Node n = eans.item(j);
            if (!(n instanceof Element e)) continue;

            String val = digitsOnly(e.getAttribute("Value"));
            if (val.length() == 13) return val;
        }

        return "";
    }

    private String safe(String s) {
        return s == null ? "" : s.trim();
    }

    private String digitsOnly(String s) {
        if (s == null) return "";
        return s.replaceAll("\\D", "");
    }
}
