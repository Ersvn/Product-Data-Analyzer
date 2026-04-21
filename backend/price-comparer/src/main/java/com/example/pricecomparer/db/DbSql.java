package com.example.pricecomparer.db;

public final class DbSql {

    private DbSql() {
    }

    public static final String COMPANY_EAN_UID = "nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')";
    public static final String COMPANY_MPN_UID = "nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')";
    public static final String COMPANY_TO_MARKET_JOIN = "r.uid = " + COMPANY_EAN_UID + " or r.uid = " + COMPANY_MPN_UID;

    public static final String SCRAPED_EAN_UID = "nullif(regexp_replace(coalesce(sp.ean, ''), '[^0-9]', '', 'g'), '')";
    public static final String SCRAPED_MPN_UID = "nullif(regexp_replace(upper(coalesce(sp.mpn, '')), '[^0-9A-Z]', '', 'g'), '')";

    public static final String EFFECTIVE_PRICE_SQL = """
        case
          when upper(coalesce(c.price_mode, 'AUTO')) = 'MANUAL'
               and coalesce(c.manual_price, 0) > 0
            then c.manual_price
          else coalesce(c.our_price, 0)
        end
        """;

    public static final String BENCHMARK_PRICE_SQL = """
        case
          when coalesce(r.price_median, 0) > 0 then r.price_median
          when coalesce(r.price_min, 0) > 0 and coalesce(r.price_max, 0) > 0
            then round(((r.price_min + r.price_max) / 2.0)::numeric, 2)
          when coalesce(r.price_min, 0) > 0 then r.price_min
          when coalesce(r.price_max, 0) > 0 then r.price_max
          else null
        end
        """;

    public static final String COMPANY_LISTING_SELECT = """
        c.id,
        c.company_sku,
        c.ean,
        c.mpn,
        c.name,
        c.brand,
        c.category,
        c.our_price,
        c.cost_price,
        c.price_mode,
        c.manual_price,
        c.last_updated,
        exists (
          select 1
          from scraped_market_rollup r
          where %s
        ) as market_matched,
        coalesce((
          select r.offers_count
          from scraped_market_rollup r
          where %s
          order by r.last_scraped desc nulls last
          limit 1
        ), 0) as competitor_count
        """.formatted(COMPANY_TO_MARKET_JOIN, COMPANY_TO_MARKET_JOIN);
}
