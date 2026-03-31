package com.example.pricecomparer.db;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class DbImportController {

    private final DbImportService importSvc;

    public DbImportController(DbImportService importSvc) {
        this.importSvc = importSvc;
    }

    @PostMapping("/api/db/import")
    public Map<String, Object> importAll() throws Exception {
        return importSvc.importAll();
    }
}