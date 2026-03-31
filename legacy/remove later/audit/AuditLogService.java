//package com.example.pricecomparer.audit;
//
//import com.example.pricecomparer.io.JsonlFileAppender;
//import jakarta.servlet.http.HttpServletRequest;
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.stereotype.Service;
//
//import java.time.Instant;
//import java.util.LinkedHashMap;
//import java.util.Map;
//
//@Service
//public class AuditLogService {
//
//    private final JsonlFileAppender appender;
//
//    @Value("${app.data.auditPath:file:./data/audit-log.jsonl}")
//    private String auditPath;
//
//    public AuditLogService(JsonlFileAppender appender) {
//        this.appender = appender;
//    }
//
//    public void log(HttpServletRequest req, String actor, String action, long productId, Map<String, Object> details) {
//        Map<String, Object> event = new LinkedHashMap<>();
//        event.put("ts", Instant.now().toString());
//        event.put("actor", actor == null ? "unknown" : actor);
//        event.put("action", action);
//        event.put("productId", productId);
//
//        if (req != null) {
//            event.put("ip", clientIp(req));
//            event.put("ua", safe(req.getHeader("User-Agent")));
//            event.put("path", safe(req.getRequestURI()));
//        }
//
//        if (details != null && !details.isEmpty()) {
//            event.put("details", details);
//        }
//
//        appender.append(auditPath, event);
//    }
//
//    private String clientIp(HttpServletRequest req) {
//        String xff = req.getHeader("X-Forwarded-For");
//        if (xff != null && !xff.isBlank()) {
//            return xff.split(",")[0].trim();
//        }
//        return req.getRemoteAddr();
//    }
//
//    private String safe(String s) {
//        return (s == null) ? "" : s;
//    }
//}
