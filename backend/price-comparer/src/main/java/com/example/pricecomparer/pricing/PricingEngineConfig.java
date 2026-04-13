package com.example.pricecomparer.pricing;

import com.example.pricing.core.PricingRule;
import com.example.pricing.core.PricingStrategyEngine;
import com.example.pricing.post.Psychological90Processor;
import com.example.pricing.rules.IgnoreBelowCostMarketRule;
import com.example.pricing.rules.SoloMarketPremiumRule;
import com.example.pricing.rules.UndercutIfCompetitionRule;
import com.example.pricing.post.NeverBelowCostProcessor;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Configuration
public class PricingEngineConfig {

    @Bean
    public PricingStrategyEngine pricingStrategyEngine(PricingProperties props) {

        List<PricingRule> rules = new ArrayList<>();

        if (props.getRules().getIgnoreBelowCostMarket().isEnabled()) {
            rules.add(new IgnoreBelowCostMarketRule());
        }

        if (props.getRules().getUndercutIfCompetition().isEnabled()) {
            rules.add(new UndercutIfCompetitionRule(
                    props.getRules().getUndercutIfCompetition().getUndercutPercent(),
                    props.getRules().getUndercutIfCompetition().isRequireCompetitors()
            ));
        }

        if (props.getRules().getSoloMarketPremium().isEnabled()) {
            rules.add(new SoloMarketPremiumRule(
                    props.getRules().getSoloMarketPremium().getPremiumFactor()
            ));
        }

        var post = new ArrayList<PricingStrategyEngine.PricePostProcessor>();

        if (props.getPost().getPsychological90().isEnabled()) {
            post.add(new Psychological90Processor());
        }

        post.add(new NeverBelowCostProcessor());

        PricingStrategyEngine.Mode mode = (props.getMode() == PricingProperties.Mode.APPLY_ALL)
                ? PricingStrategyEngine.Mode.APPLY_ALL
                : PricingStrategyEngine.Mode.FIRST_MATCH_WINS;

        return new PricingStrategyEngine(rules, post, mode);
    }
}
