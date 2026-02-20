package com.example.pricecomparer.pricing;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@ConfigurationProperties(prefix = "pricing")
public class PricingProperties {

    // Matchar core-engine: PricingStrategyEngine.Mode
    public enum Mode {
        FIRST_MATCH_WINS,
        APPLY_ALL
    }

    private Mode mode = Mode.FIRST_MATCH_WINS;

    private Rules rules = new Rules();
    private Post post = new Post();

    public Mode getMode() { return mode; }
    public void setMode(Mode mode) { this.mode = mode; }

    public Rules getRules() { return rules; }
    public void setRules(Rules rules) { this.rules = rules; }

    public Post getPost() { return post; }
    public void setPost(Post post) { this.post = post; }

    public static class Rules {
        private UndercutIfCompetition undercutIfCompetition = new UndercutIfCompetition();
        private SoloMarketPremium soloMarketPremium = new SoloMarketPremium();
        private IgnoreBelowCostMarket ignoreBelowCostMarket = new IgnoreBelowCostMarket();

        public UndercutIfCompetition getUndercutIfCompetition() { return undercutIfCompetition; }
        public void setUndercutIfCompetition(UndercutIfCompetition undercutIfCompetition) { this.undercutIfCompetition = undercutIfCompetition; }

        public SoloMarketPremium getSoloMarketPremium() { return soloMarketPremium; }
        public void setSoloMarketPremium(SoloMarketPremium soloMarketPremium) { this.soloMarketPremium = soloMarketPremium; }

        public IgnoreBelowCostMarket getIgnoreBelowCostMarket() { return ignoreBelowCostMarket; }
        public void setIgnoreBelowCostMarket(IgnoreBelowCostMarket ignoreBelowCostMarket) { this.ignoreBelowCostMarket = ignoreBelowCostMarket; }

        public static class UndercutIfCompetition {
            private boolean enabled = true;
            private BigDecimal undercutPercent = new BigDecimal("0.01");
            private boolean requireCompetitors = true;

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }

            public BigDecimal getUndercutPercent() { return undercutPercent; }
            public void setUndercutPercent(BigDecimal undercutPercent) { this.undercutPercent = undercutPercent; }

            public boolean isRequireCompetitors() { return requireCompetitors; }
            public void setRequireCompetitors(boolean requireCompetitors) { this.requireCompetitors = requireCompetitors; }
        }

        public static class SoloMarketPremium {
            private boolean enabled = true;
            private BigDecimal premiumFactor = new BigDecimal("0.98");

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }

            public BigDecimal getPremiumFactor() { return premiumFactor; }
            public void setPremiumFactor(BigDecimal premiumFactor) { this.premiumFactor = premiumFactor; }
        }

        public static class IgnoreBelowCostMarket {
            private boolean enabled = true;

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }
        }
    }

    public static class Post {
        private Psychological90 psychological90 = new Psychological90();

        public Psychological90 getPsychological90() { return psychological90; }
        public void setPsychological90(Psychological90 psychological90) { this.psychological90 = psychological90; }

        public static class Psychological90 {
            private boolean enabled = true;

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }
        }
    }
}
