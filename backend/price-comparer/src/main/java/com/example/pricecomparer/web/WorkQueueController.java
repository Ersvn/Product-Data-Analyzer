package com.example.pricecomparer.web;

import com.example.pricecomparer.dashboard.WorkQueueService;
import com.example.pricecomparer.dashboard.WorkQueueService.QueueType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class WorkQueueController {

    private final WorkQueueService workQueue;
    public WorkQueueController(WorkQueueService workQueue) {
        this.workQueue = workQueue;
    }

    @GetMapping("/api/dashboard/queue")
    public Map<String, Object> queue(
            @RequestParam(defaultValue = "OUTLIERS") String type,
            @RequestParam(defaultValue = "25") int limit
    ) {
        QueueType t;
        try {
            t = QueueType.valueOf(type.trim().toUpperCase());
        } catch (Exception e) {
            t = QueueType.OUTLIERS;
        }
        return workQueue.queue(t, limit);
    }
}
