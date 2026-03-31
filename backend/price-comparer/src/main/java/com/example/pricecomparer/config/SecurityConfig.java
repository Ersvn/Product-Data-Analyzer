package com.example.pricecomparer.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Value("${app.dashUser:admin}")
    private String user;

    @Value("${app.dashPass:change-me}")
    private String pass;

    @Bean
    public UserDetailsService users() {
        UserDetails u = User.withUsername(user)
                .password("{noop}" + pass)
                .roles("DASH")
                .build();
        return new InMemoryUserDetailsManager(u);
    }

    @Bean
    public SecurityFilterChain chain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .httpBasic(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/health", "/robots.txt", "/sitemap.xml").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/pricing/quote").permitAll()
                        .requestMatchers("/api/debug/**").authenticated()
                        .requestMatchers("/api/_debug/**").authenticated()
                        .requestMatchers("/api/**").permitAll() //Ändra tillbaka till authenticated() sen!

                        .anyRequest().permitAll()
                );
        return http.build();
    }
}
