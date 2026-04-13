package com.example.pricecomparer.pricing;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;

@Setter
@Getter
@ConfigurationProperties(prefix = "pricing")
public class PricingProperties {

    public enum Mode {
        FIRST_MATCH_WINS,
        APPLY_ALL
    }

    private Mode mode = Mode.FIRST_MATCH_WINS;

    private Rules rules = new Rules();
    private Post post = new Post();

    @Getter
    @Setter
    public static class Rules {
        private UndercutIfCompetition undercutIfCompetition = new UndercutIfCompetition();
        private SoloMarketPremium soloMarketPremium = new SoloMarketPremium();
        private IgnoreBelowCostMarket ignoreBelowCostMarket = new IgnoreBelowCostMarket();

        @Setter
        @Getter
        public static class UndercutIfCompetition {
            private boolean enabled = true;
            private BigDecimal undercutPercent = new BigDecimal("0.01");
            private boolean requireCompetitors = true;

        }

        @Setter
        @Getter
        public static class SoloMarketPremium {
            private boolean enabled = true;
            private BigDecimal premiumFactor = new BigDecimal("0.98");

        }

        @Setter
        @Getter
        public static class IgnoreBelowCostMarket {
            private boolean enabled = true;

        }
    }

    @Setter
    @Getter
    public static class Post {
        private Psychological90 psychological90 = new Psychological90();

        @Setter
        @Getter
        public static class Psychological90 {
            private boolean enabled = true;

        }
    }
}
