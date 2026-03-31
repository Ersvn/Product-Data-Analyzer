package com.example.pricecomparer.db;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.example.pricecomparer.db.DbImportUtils.chooseCompanySku;
import static com.example.pricecomparer.db.DbImportUtils.firstNonBlank;
import static com.example.pricecomparer.db.DbImportUtils.normEan;
import static com.example.pricecomparer.db.DbImportUtils.normalizeIdentifier;
import static com.example.pricecomparer.db.DbImportUtils.str;
import static com.example.pricecomparer.db.DbImportUtils.toBigDecimal;

@Service
public class DbImportService {

    private final JdbcTemplate jdbc;
    private final DbJsonImportReader jsonReader;

    @Value("${app.data.marketPath:}")
    private String marketPath;

    @Value("${app.data.companyPath:}")
    private String companyPath;

    public DbImportService(JdbcTemplate jdbc, DbJsonImportReader jsonReader) {
        this.jdbc = jdbc;
        this.jsonReader = jsonReader;
    }

    @Transactional
    public Map<String, Object> importAll() throws Exception {
        int marketRows = hasText(marketPath) ? importMarket() : 0;
        int companyRows = hasText(companyPath) ? importCompany() : 0;

        Integer company = jdbc.queryForObject("select count(*) from company_listings", Integer.class);
        Integer scraped = jdbc.queryForObject("select count(*) from scraped_products", Integer.class);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("company_rows_processed", companyRows);
        out.put("market_rows_processed", marketRows);
        out.put("company_listings_total", company == null ? 0 : company);
        out.put("scraped_products_total", scraped == null ? 0 : scraped);
        return out;
    }

    private int importCompany() throws Exception {
        List<Map<String, Object>> rows = jsonReader.readJsonArray(companyPath);
        int processed = 0;

        for (Map<String, Object> row : rows) {
            String name = str(row.get("name"));
            String brand = str(row.get("brand"));
            String category = str(row.get("category"));

            String ean = normEan(str(row.get("ean")));
            String mpnRaw = str(row.get("mpn"));
            String mpnNorm = mpnRaw == null ? null : normalizeIdentifier("MPN", mpnRaw);

            String skuRaw = firstNonBlank(row, "companySku", "sku");
            String skuNorm = skuRaw == null ? null : normalizeIdentifier("SKU", skuRaw);

            String rawId = str(row.get("id"));
            String companySku = chooseCompanySku(
                    (ean == null || ean.isBlank()) ? null : ean,
                    mpnNorm,
                    skuNorm,
                    rawId
            );

            if (companySku == null || companySku.isBlank()) {
                companySku = "ID:" + UUID.randomUUID();
            }

            BigDecimal ourPrice = toBigDecimal(row.get("ourPrice"));
            if (ourPrice == null) ourPrice = toBigDecimal(row.get("price"));

            BigDecimal costPrice = toBigDecimal(row.get("costPrice"));
            if (costPrice == null) costPrice = toBigDecimal(row.get("cost"));

            String eanToStore = (ean == null || ean.isBlank()) ? null : ean;
            String mpnToStore = (mpnNorm == null || mpnNorm.isBlank()) ? null : mpnRaw;

            jdbc.update("""
                insert into company_listings
                  (company_sku, ean, mpn, name, brand, category, cost_price, our_price, price_mode, manual_price, last_updated)
                values
                  (?, ?, ?, ?, ?, ?, ?, ?, 'AUTO', null, now())
                on conflict (company_sku) do update set
                  ean          = excluded.ean,
                  mpn          = excluded.mpn,
                  name         = excluded.name,
                  brand        = excluded.brand,
                  category     = excluded.category,
                  cost_price   = excluded.cost_price,
                  our_price    = case
                                   when upper(coalesce(company_listings.price_mode, 'AUTO')) = 'MANUAL'
                                     then company_listings.our_price
                                   else excluded.our_price
                                 end,
                  last_updated = now()
            """,
                    companySku,
                    eanToStore,
                    mpnToStore,
                    name,
                    brand,
                    category,
                    costPrice,
                    ourPrice
            );

            processed++;
        }

        return processed;
    }

    private int importMarket() throws Exception {
        List<Map<String, Object>> rows = jsonReader.readJsonArray(marketPath);
        int processed = 0;

        for (Map<String, Object> row : rows) {
            String url = str(row.get("url"));
            if (url == null || url.isBlank()) {
                continue;
            }

            String siteName = firstNonBlank(row, "site_name", "siteName", "store");
            String name = str(row.get("name"));
            String brand = str(row.get("brand"));

            String ean = normEan(str(row.get("ean")));
            String mpnRaw = str(row.get("mpn"));
            String skuRaw = firstNonBlank(row, "sku", "articleNumber");

            String eanNorm = (ean == null || ean.isBlank()) ? null : ean;
            String mpnNorm = mpnRaw == null ? null : normalizeIdentifier("MPN", mpnRaw);
            String uidNorm = eanNorm != null ? eanNorm : mpnNorm;

            BigDecimal price = toBigDecimal(row.get("price"));
            if (price == null) price = toBigDecimal(row.get("latest_price"));
            if (price == null) price = toBigDecimal(row.get("priceMin"));
            if (price == null) price = toBigDecimal(row.get("priceMax"));

            jdbc.update("""
                insert into scraped_products
                  (url, site_name, name, brand, ean, mpn, sku, price, currency, in_stock,
                   last_scraped, last_scanned, ean_norm, mpn_norm, uid_norm, created_at, updated_at)
                values
                  (?, ?, ?, ?, ?, ?, ?, ?, 'SEK', true,
                   now(), now(), ?, ?, ?, now(), now())
                on conflict (url) do update set
                  site_name    = excluded.site_name,
                  name         = excluded.name,
                  brand        = excluded.brand,
                  ean          = excluded.ean,
                  mpn          = excluded.mpn,
                  sku          = excluded.sku,
                  price        = excluded.price,
                  last_scraped = now(),
                  last_scanned = now(),
                  ean_norm     = excluded.ean_norm,
                  mpn_norm     = excluded.mpn_norm,
                  uid_norm     = excluded.uid_norm,
                  updated_at   = now()
            """,
                    url,
                    siteName,
                    name,
                    brand,
                    eanNorm,
                    mpnRaw,
                    skuRaw,
                    price,
                    eanNorm,
                    mpnNorm,
                    uidNorm
            );

            processed++;
        }

        return processed;
    }

    private boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}