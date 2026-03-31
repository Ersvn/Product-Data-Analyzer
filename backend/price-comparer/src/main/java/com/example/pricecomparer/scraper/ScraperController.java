package com.example.pricecomparer.scraper;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ScraperController {

    private final ScraperService scraperService;

    public ScraperController(ScraperService scraperService) {
        this.scraperService = scraperService;
    }

    @GetMapping("/api/scraper/status")
    public ScraperService.ScraperStatus getStatus() {
        return scraperService.getStatus();
    }

    @GetMapping("/api/scraper/logs")
    public Map<String, Object> getLogs(@RequestParam(defaultValue = "200") int limit) {
        return Map.of("logs", scraperService.getLogs(limit));
    }

    @GetMapping("/api/scraper/runs")
    public Map<String, Object> getRuns(@RequestParam(defaultValue = "20") int limit) {
        return Map.of("runs", scraperService.getRuns(limit));
    }

    @PostMapping("/api/scraper/start")
    public ScraperService.ScraperStatus start() {
        scraperService.start();
        return scraperService.getStatus();
    }

    @PostMapping("/api/scraper/stop")
    public ScraperService.ScraperStatus stop() {
        scraperService.stop();
        return scraperService.getStatus();
    }
}