package com.example.pricecomparer.pricing;

import com.example.pricing.core.PricingRule;
import com.example.pricing.core.PricingStrategyEngine;
import com.example.pricing.post.NeverBelowCostProcessor;
import com.example.pricing.post.Psychological90Processor;
import com.example.pricing.rules.IgnoreBelowCostMarketRule;
import com.example.pricing.rules.SoloMarketPremiumRule;
import com.example.pricing.rules.UndercutIfCompetitionRule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Configuration
public class PricingEngineConfig {

    @Bean
    public PricingStrategyEngine pricingStrategyEngine(PricingProperties props) {
        List<PricingRule> rules = buildRules(props);
        List<PricingStrategyEngine.PricePostProcessor> postProcessors = buildPostProcessors(props);
        PricingStrategyEngine.Mode mode = props.getMode() == PricingProperties.Mode.APPLY_ALL
                ? PricingStrategyEngine.Mode.APPLY_ALL
                : PricingStrategyEngine.Mode.FIRST_MATCH_WINS;

        return new PricingStrategyEngine(rules, postProcessors, mode);
    }

    private List<PricingRule> buildRules(PricingProperties props) {
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
            rules.add(new SoloMarketPremiumRule(props.getRules().getSoloMarketPremium().getPremiumFactor()));
        }

        return rules;
    }

    private List<PricingStrategyEngine.PricePostProcessor> buildPostProcessors(PricingProperties props) {
        List<PricingStrategyEngine.PricePostProcessor> postProcessors = new ArrayList<>();
        if (props.getPost().getPsychological90().isEnabled()) {
            postProcessors.add(new Psychological90Processor());
        }
        postProcessors.add(new NeverBelowCostProcessor());
        return postProcessors;
    }
}
