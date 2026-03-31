package com.example.pricecomparer.scraper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ScraperService {

    private static final int MAX_LOG_LINES = 500;
    private static final int MAX_RUNS = 20;

    private static final Pattern NUMBER_PATTERN = Pattern.compile("(\\d[\\d\\s]*)$");

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Deque<String> logs = new ArrayDeque<>();
    private final Deque<ScrapeRun> runs = new ArrayDeque<>();

    @Value("${app.scraper.command:node}")
    private String nodeCommand;

    @Value("${app.scraper.script:main-v2.js}")
    private String scraperScript;

    @Value("${app.scraper.workingDir:C:/Users/eriks/eclipse-workspace/Product-Data-Analyzer/scraper}")
    private String scraperWorkingDir;

    private volatile Process process;
    private volatile boolean running;
    private volatile String status = "IDLE";
    private volatile String startedAt;
    private volatile String finishedAt;
    private volatile String currentSite;
    private volatile int discovered;
    private volatile int skipped;
    private volatile int created;
    private volatile int updated;
    private volatile int failed;
    private volatile int suspectedChanges;

    public synchronized void start() {
        if (running) {
            return;
        }

        resetStatus();
        running = true;
        status = "RUNNING";
        startedAt = Instant.now().toString();
        finishedAt = null;

        File workDir = new File(scraperWorkingDir);
        if (!workDir.exists() || !workDir.isDirectory()) {
            running = false;
            status = "FAILED";
            pushLog("❌ Scraper workingDir finns inte: " + scraperWorkingDir);
            throw new IllegalStateException("Scraper workingDir finns inte: " + scraperWorkingDir);
        }

        try {
            ProcessBuilder pb = new ProcessBuilder(nodeCommand, scraperScript);
            pb.directory(workDir);
            pb.redirectErrorStream(true);

            process = pb.start();
            pushLog("🚀 Startar scraper: " + nodeCommand + " " + scraperScript);

            executor.submit(() -> readProcessOutput(process));
            executor.submit(() -> waitForExit(process));
        } catch (Exception e) {
            running = false;
            status = "FAILED";
            pushLog("❌ Kunde inte starta scraper: " + e.getMessage());
            throw new IllegalStateException("Kunde inte starta scraper", e);
        }
    }

    public synchronized void stop() {
        if (process == null || !running) {
            status = "IDLE";
            return;
        }

        status = "STOPPING";
        pushLog("🛑 Stoppar scraper...");
        process.destroy();

        try {
            Thread.sleep(1500);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }

        if (process.isAlive()) {
            process.destroyForcibly();
        }
    }

    public ScraperStatus getStatus() {
        return new ScraperStatus(
                running,
                status,
                startedAt,
                finishedAt,
                currentSite,
                discovered,
                skipped,
                created,
                updated,
                failed,
                suspectedChanges
        );
    }

    public List<String> getLogs(int limit) {
        synchronized (logs) {
            List<String> all = new ArrayList<>(logs);
            int from = Math.max(0, all.size() - Math.max(1, limit));
            return all.subList(from, all.size());
        }
    }

    public List<ScrapeRun> getRuns(int limit) {
        synchronized (runs) {
            List<ScrapeRun> all = new ArrayList<>(runs);
            int to = Math.min(all.size(), Math.max(1, limit));
            return all.subList(0, to);
        }
    }

    private void readProcessOutput(Process p) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.stripTrailing();
                pushLog(trimmed);
                parseLine(trimmed);
            }
        } catch (Exception e) {
            pushLog("❌ Fel när scraper-output lästes: " + e.getMessage());
        }
    }

    private void waitForExit(Process p) {
        try {
            int exit = p.waitFor();

            synchronized (this) {
                running = false;
                finishedAt = Instant.now().toString();

                if ("STOPPING".equals(status)) {
                    status = "IDLE";
                    pushRun("STOPPED");
                } else if (exit == 0) {
                    status = "COMPLETED";
                    pushRun("COMPLETED");
                } else {
                    status = "FAILED";
                    pushRun("FAILED");
                }

                pushLog("ℹ️ Scraper avslutad med exit code: " + exit);
                process = null;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            synchronized (this) {
                running = false;
                finishedAt = Instant.now().toString();
                status = "FAILED";
                pushRun("FAILED");
                pushLog("❌ Väntan på scraper avbröts");
                process = null;
            }
        }
    }

    private void parseLine(String line) {
        String lower = line.toLowerCase();

        if (lower.contains("crawlar komplett")) currentSite = "komplett";
        else if (lower.contains("crawlar dustin")) currentSite = "dustin";
        else if (lower.contains("crawlar webhallen")) currentSite = "webhallen";

        if (line.contains("📦 Totalt upptäckta URLs:")) {
            discovered = parseTrailingInt(line);
        } else if (line.contains("⏩ Skippade (cache):")) {
            skipped = parseTrailingInt(line);
        } else if (line.contains("🆕 Nya produkter:")) {
            created = parseTrailingInt(line);
        } else if (line.contains("♻️  Uppdaterade:") || line.contains("♻️ Uppdaterade:")) {
            updated = parseTrailingInt(line);
        } else if (line.contains("❌ Misslyckade:")) {
            failed = parseTrailingInt(line);
        } else if (line.contains("⚠️  Misstänkta byten:") || line.contains("⚠️ Misstänkta byten:")) {
            suspectedChanges = parseTrailingInt(line);
        }
    }

    private int parseTrailingInt(String line) {
        Matcher m = NUMBER_PATTERN.matcher(line.trim());
        if (!m.find()) return 0;
        String raw = m.group(1).replace(" ", "");
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void pushLog(String line) {
        synchronized (logs) {
            logs.addLast(line);
            while (logs.size() > MAX_LOG_LINES) {
                logs.removeFirst();
            }
        }
    }

    private void pushRun(String finalStatus) {
        synchronized (runs) {
            runs.addFirst(new ScrapeRun(
                    UUID.randomUUID().toString(),
                    finalStatus,
                    startedAt,
                    finishedAt,
                    discovered,
                    skipped,
                    created,
                    updated,
                    failed,
                    suspectedChanges
            ));
            while (runs.size() > MAX_RUNS) {
                runs.removeLast();
            }
        }
    }

    private void resetStatus() {
        logs.clear();
        currentSite = null;
        discovered = 0;
        skipped = 0;
        created = 0;
        updated = 0;
        failed = 0;
        suspectedChanges = 0;
    }

    @PreDestroy
    public void shutdown() {
        if (process != null && process.isAlive()) {
            process.destroyForcibly();
        }
        executor.shutdownNow();
    }

    public record ScraperStatus(
            boolean running,
            String status,
            String startedAt,
            String finishedAt,
            String currentSite,
            int discovered,
            int skipped,
            int created,
            int updated,
            int failed,
            int suspectedChanges
    ) {}

    public record ScrapeRun(
            String id,
            String status,
            String startedAt,
            String finishedAt,
            int discovered,
            int skipped,
            int created,
            int updated,
            int failed,
            int suspectedChanges
    ) {}
}