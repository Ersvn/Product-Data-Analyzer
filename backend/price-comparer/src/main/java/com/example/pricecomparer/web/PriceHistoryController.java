package com.example.pricecomparer.web;

import com.example.pricecomparer.domain.CompareHistoryResponse;
import com.example.pricecomparer.domain.HistoryResponse;
import com.example.pricecomparer.domain.PricePoint;
import com.example.pricecomparer.service.PriceHistoryService;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;


@RestController
public class PriceHistoryController {

    private final PriceHistoryService history;

    public PriceHistoryController(PriceHistoryService history) {
        this.history = history;
    }

    @GetMapping("/api/history/{ean}")
    public HistoryResponse historyByEan(
            @PathVariable String ean,
            @RequestParam(defaultValue = "market") String source,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "90") int days,
            @RequestParam(defaultValue = "500") int limit
    ) {
        LocalDate end = (to != null && !to.isBlank()) ? LocalDate.parse(to) : LocalDate.now();
        LocalDate start = (from != null && !from.isBlank()) ? LocalDate.parse(from) : end.minusDays(days);

        List<PricePoint> data = history.getHistory(ean, source, start, end, limit);

        HistoryResponse res = new HistoryResponse();
        res.meta = Map.of(
                "ean", ean,
                "source", source,
                "from", start.toString(),
                "to", end.toString(),
                "count", data.size()
        );
        res.data = data;
        return res;
    }

    @GetMapping("/api/history/compare/{ean}")
    public CompareHistoryResponse compareHistory(
            @PathVariable String ean,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "90") int days,
            @RequestParam(defaultValue = "500") int limit
    ) {
        LocalDate end = (to != null && !to.isBlank()) ? LocalDate.parse(to) : LocalDate.now();
        LocalDate start = (from != null && !from.isBlank()) ? LocalDate.parse(from) : end.minusDays(days);

        var map = history.getCompareHistory(ean, start, end, limit);

        CompareHistoryResponse res = new CompareHistoryResponse();
        res.ean = ean;
        res.market = map.get("market");
        res.company = map.get("company");
        return res;
    }
}