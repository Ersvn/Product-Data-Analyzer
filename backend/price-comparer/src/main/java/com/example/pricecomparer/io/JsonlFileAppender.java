package com.example.pricecomparer.io;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;

@Component
public class JsonlFileAppender {

    private final ResourceLoader resourceLoader;
    private final ObjectMapper om;

    public JsonlFileAppender(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
        this.om = new ObjectMapper()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    public synchronized void append(String resourcePath, Object event) {
        if (resourcePath == null || resourcePath.isBlank()) {
            throw new IllegalArgumentException("resourcePath is required");
        }
        try {
            Path path = resolveToWritablePath(resourcePath);
            ensureParentDir(path);

            String line = om.writeValueAsString(event);

            try (BufferedWriter w = Files.newBufferedWriter(
                    path,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.APPEND
            )) {
                w.write(line);
                w.write("\n");
            }
        } catch (Exception e) {
            // Production stance: logga men krascha inte hela requesten.
            // Du kan senare koppla detta till logger/metrics.
            System.err.println("[JSONL] Failed to append at " + Instant.now() + " path=" + resourcePath + " err=" + e);
        }
    }

    private Path resolveToWritablePath(String resourcePath) throws IOException {
        // Vi stödjer bara file: som writable i MVP/prod. Classpath är inte skrivbart.
        Resource r = resourceLoader.getResource(resourcePath);
        if (resourcePath.startsWith("file:")) {
            // "file:./data/x.jsonl" => "./data/x.jsonl"
            String p = resourcePath.substring("file:".length());
            return Paths.get(p).toAbsolutePath().normalize();
        }

        // Om någon råkar ge classpath: här så försöker vi inte skriva (inte writable).
        // Men vi kan ändå ge en tydlig signal.
        if (r.exists()) {
            throw new IOException("Resource is not writable: " + resourcePath + " (use file:...)");
        }
        throw new IOException("Unsupported resourcePath: " + resourcePath + " (use file:...)");
    }

    private void ensureParentDir(Path path) throws IOException {
        Path parent = path.getParent();
        if (parent != null && !Files.exists(parent)) {
            Files.createDirectories(parent);
        }
    }
}
