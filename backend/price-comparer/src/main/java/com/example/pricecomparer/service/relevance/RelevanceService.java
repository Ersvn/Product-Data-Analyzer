package com.example.pricecomparer.service.relevance;

import com.example.pricecomparer.domain.Product;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
public class RelevanceService {

    private final RelevanceProperties props;
    private final List<Pattern> blockedPatterns;

    public RelevanceService(RelevanceProperties props) {
        this.props = props;
        this.blockedPatterns = props.getBlockedNameRegex().stream()
                .map(Pattern::compile)
                .toList();
    }

    public boolean isRelevant(Product p) {
        if (!props.isEnabled()) return true;
        if (p == null) return false;
        if (blank(p.ean)) return false;

        String name = safeLower(p.name);
        String cat  = safeLower(p.category);

        // Hard-blocks
        if (containsAny(name, props.getBlockedKeywords()) || containsAny(cat, props.getBlockedKeywords())) return false;
        for (Pattern pat : blockedPatterns) {
            if (pat.matcher(name).matches()) return false;
        }

        int score = 0;

        // Category whitelist keywords
        if (containsAny(cat, props.getAllowedCategoryKeywords())) score += 2;

        // Name keywords (same list works ok)
        if (containsAny(name, props.getAllowedCategoryKeywords())) score += 1;

        // Brand present is a weak positive signal
        if (!blank(p.brand)) score += 1;

        // Penalize “pure part number” names (no spaces) unless category clearly IT
        if (!blank(p.name) && !p.name.contains(" ") && !containsAny(cat, props.getAllowedCategoryKeywords())) score -= 2;

        return score >= props.getMinScore();
    }

    private boolean containsAny(String hay, List<String> needles) {
        if (hay == null || hay.isBlank()) return false;
        for (String n : needles) {
            if (n == null || n.isBlank()) continue;
            if (hay.contains(n.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private boolean blank(String s) { return s == null || s.isBlank(); }
    private String safeLower(String s) { return s == null ? "" : s.toLowerCase(Locale.ROOT); }
}
