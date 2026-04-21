package com.example.pricecomparer.web;

import com.example.pricecomparer.dashboard.DashboardOverview;
import com.example.pricecomparer.dashboard.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DashboardController {

    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping("/api/dashboard/overview")
    public DashboardOverview overview(@RequestParam(defaultValue = "30") int days) {
        return dashboard.overview(Math.max(1, Math.min(days, 365)));
    }
}
