package com.example.pricecomparer.db;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class DbSeedService {

    private final JdbcTemplate jdbc;

    public DbSeedService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> seedFromScraped(int percent, int limit, String siteName) {
        if (percent < 1) percent = 1;
        if (percent > 100) percent = 100;
        if (limit < 1) limit = 1;
        if (limit > 5000) limit = 5000;

        String site = siteName == null ? "" : siteName.trim();

        String sql = """
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
                  nullif(regexp_replace(coalesce(sp.ean, ''), '[^0-9]', '', 'g'), '') is not null
                  or nullif(regexp_replace(upper(coalesce(sp.mpn, '')), '[^0-9A-Z]', '', 'g'), '') is not null
                )
                and (? = '' or lower(coalesce(sp.site_name, '')) = lower(?))
            )
            select *
            from candidates
            where ((rn - 1) % 100) < ?
            order by rn
            limit ?
        """;

        var rows = jdbc.queryForList(sql, site, site, percent, limit);

        int inserted = 0;
        int skipped = 0;

        for (Map<String, Object> row : rows) {
            String ean = DbImportUtils.normEan(DbImportUtils.str(row.get("ean")));
            String mpn = DbImportUtils.str(row.get("mpn"));
            String name = DbImportUtils.str(row.get("name"));
            String brand = DbImportUtils.str(row.get("brand"));
            String sourceSite = DbImportUtils.str(row.get("site_name"));

            BigDecimal marketPrice = DbImportUtils.toBigDecimal(row.get("price"));
            if (marketPrice == null || marketPrice.signum() <= 0) {
                skipped++;
                continue;
            }

            String companySku = buildCompanySku(ean, mpn, row.get("id"));
            BigDecimal costPrice = marketPrice.multiply(new BigDecimal("0.78")).setScale(2, RoundingMode.HALF_UP);
            BigDecimal ourPrice = marketPrice.multiply(new BigDecimal("0.97")).setScale(2, RoundingMode.HALF_UP);

            int updated = jdbc.update("""
                insert into company_listings
                  (company_sku, ean, mpn, name, brand, category, cost_price, our_price, price_mode, manual_price, last_updated)
                values
                  (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', null, now())
                on conflict (company_sku) do nothing
            """,
                    companySku,
                    ean,
                    mpn,
                    name,
                    brand,
                    "Seeded from scraped market",
                    costPrice,
                    ourPrice
            );

            if (updated > 0) {
                inserted++;
            } else {
                skipped++;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("siteName", site);
        out.put("percent", percent);
        out.put("limit", limit);
        out.put("selected", rows.size());
        out.put("inserted", inserted);
        out.put("skipped", skipped);
        return out;
    }

    private String buildCompanySku(String ean, String mpn, Object id) {
        if (ean != null && !ean.isBlank()) {
            return "SEED-EAN-" + ean;
        }
        if (mpn != null && !mpn.isBlank()) {
            String normalized = mpn.replaceAll("[^0-9A-Za-z]+", "").toUpperCase();
            if (!normalized.isBlank()) {
                return "SEED-MPN-" + normalized;
            }
        }
        return "SEED-ID-" + String.valueOf(id);
    }
}