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
        if (days < 1) days = 1;
        if (days > 365) days = 365;
        return dashboard.overview(days);
    }
}
