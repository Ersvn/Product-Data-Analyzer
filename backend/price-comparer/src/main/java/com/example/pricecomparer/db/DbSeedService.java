package com.example.pricecomparer.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DbSeedService {

    private static final BigDecimal COST_FACTOR = new BigDecimal("0.78");
    private static final BigDecimal OUR_PRICE_FACTOR = new BigDecimal("0.97");

    private final JdbcTemplate jdbc;

    public DbSeedService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> seedFromScraped(int percent, int limit, String siteName) {
        int clampedPercent = DbRequestParsers.clamp(percent, 1, 100);
        int clampedLimit = DbRequestParsers.clamp(limit, 1, 5000);
        String site = siteName == null ? "" : siteName.trim();

        List<Map<String, Object>> rows = jdbc.queryForList(seedCandidatesSql(), site, site, clampedPercent, clampedLimit);

        int inserted = 0;
        int skipped = 0;

        for (Map<String, Object> row : rows) {
            BigDecimal marketPrice = DbSeedUtils.toBigDecimal(row.get("price"));
            if (marketPrice == null || marketPrice.signum() <= 0) {
                skipped++;
                continue;
            }

            int updated = jdbc.update(insertSql(),
                    buildCompanySku(row),
                    DbSeedUtils.normEan(DbSeedUtils.str(row.get("ean"))),
                    DbSeedUtils.str(row.get("mpn")),
                    DbSeedUtils.str(row.get("name")),
                    DbSeedUtils.str(row.get("brand")),
                    "Seeded from scraped market",
                    scale2(marketPrice.multiply(COST_FACTOR)),
                    scale2(marketPrice.multiply(OUR_PRICE_FACTOR))
            );

            if (updated > 0) inserted++;
            else skipped++;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("siteName", site);
        out.put("percent", clampedPercent);
        out.put("limit", clampedLimit);
        out.put("selected", rows.size());
        out.put("inserted", inserted);
        out.put("skipped", skipped);
        return out;
    }

    private String seedCandidatesSql() {
        return """
            with candidates as (
              select
                sp.id,
                sp.ean,
                sp.mpn,
                sp.name,
                sp.brand,
                sp.price,
                sp.site_name,
                row_number() over (order by sp.last_scraped desc, sp.id desc) as rn
              from scraped_products sp
              where sp.price is not null
                and sp.price > 0
                and (
                  %s is not null
                  or %s is not null
                )
                and (? = '' or lower(coalesce(sp.site_name, '')) = lower(?))
            )
            select *
            from candidates
            where ((rn - 1) %% 100) < ?
            order by rn
            limit ?
            """.formatted(DbSql.SCRAPED_EAN_UID, DbSql.SCRAPED_MPN_UID);
    }

    private String insertSql() {
        return """
            insert into company_listings
              (company_sku, ean, mpn, name, brand, category, cost_price, our_price, price_mode, manual_price, last_updated)
            values
              (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', null, now())
            on conflict (company_sku) do nothing
            """;
    }

    private String buildCompanySku(Map<String, Object> row) {
        String ean = DbSeedUtils.normEan(DbSeedUtils.str(row.get("ean")));
        if (ean != null && !ean.isBlank()) return "SEED-EAN-" + ean;

        String mpn = DbSeedUtils.str(row.get("mpn"));
        if (mpn != null && !mpn.isBlank()) {
            String normalized = mpn.replaceAll("[^0-9A-Za-z]+", "").toUpperCase();
            if (!normalized.isBlank()) return "SEED-MPN-" + normalized;
        }

        return "SEED-ID-" + row.get("id");
    }

    private BigDecimal scale2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
