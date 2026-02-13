package com.example.pricecomparer.service.relevance;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "relevance")
public class RelevanceProperties {
    private boolean enabled = true;
    private List<String> allowedCategoryKeywords = new ArrayList<>();
    private List<String> blockedKeywords = new ArrayList<>();
    private List<String> blockedNameRegex = new ArrayList<>();
    private int minScore = 2;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public List<String> getAllowedCategoryKeywords() { return allowedCategoryKeywords; }
    public void setAllowedCategoryKeywords(List<String> allowedCategoryKeywords) { this.allowedCategoryKeywords = allowedCategoryKeywords; }

    public List<String> getBlockedKeywords() { return blockedKeywords; }
    public void setBlockedKeywords(List<String> blockedKeywords) { this.blockedKeywords = blockedKeywords; }

    public List<String> getBlockedNameRegex() { return blockedNameRegex; }
    public void setBlockedNameRegex(List<String> blockedNameRegex) { this.blockedNameRegex = blockedNameRegex; }

    public int getMinScore() { return minScore; }
    public void setMinScore(int minScore) { this.minScore = minScore; }
}
