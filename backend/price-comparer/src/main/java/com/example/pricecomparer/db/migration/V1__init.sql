create table if not exists company_listings (
                                                id bigserial primary key,
                                                company_sku varchar(140) not null unique,
                                                ean varchar(32),
                                                mpn varchar(128),
                                                name text,
                                                brand varchar(128),
                                                category varchar(255),
                                                cost_price numeric(12,2),
                                                our_price numeric(12,2),
                                                price_mode varchar(16) not null default 'AUTO',
                                                manual_price numeric(12,2),
                                                last_updated timestamptz not null default now()
);

create index if not exists idx_company_listings_ean
    on company_listings(ean);

create index if not exists idx_company_listings_mpn
    on company_listings(mpn);

create index if not exists idx_company_listings_last_updated
    on company_listings(last_updated desc);


create table if not exists scraped_products (
                                                id bigserial primary key,
                                                url text not null,
                                                site_name varchar(128),
                                                name text,
                                                brand varchar(128),
                                                ean varchar(32),
                                                mpn varchar(128),
                                                sku varchar(128),
                                                price numeric(12,2),
                                                currency varchar(3) not null default 'SEK',
                                                in_stock boolean not null default true,
                                                last_scraped timestamptz not null default now(),
                                                last_scanned timestamptz not null default now(),
                                                ean_norm varchar(32),
                                                mpn_norm varchar(128),
                                                uid_norm varchar(128),
                                                created_at timestamptz not null default now(),
                                                updated_at timestamptz not null default now()
);

create unique index if not exists ux_scraped_products_url
    on scraped_products(url);

create index if not exists idx_scraped_products_ean_norm
    on scraped_products(ean_norm);

create index if not exists idx_scraped_products_mpn_norm
    on scraped_products(mpn_norm);

create index if not exists idx_scraped_products_uid_norm
    on scraped_products(uid_norm);

create index if not exists idx_scraped_products_last_scraped
    on scraped_products(last_scraped desc);

create index if not exists idx_scraped_products_price
    on scraped_products(price);


create or replace view active_products_with_price as
select
    sp.id,
    sp.site_name,
    sp.name,
    sp.brand,
    sp.ean,
    sp.mpn,
    sp.price as latest_price,
    null::numeric as previous_price,
    sp.last_scraped,
    sp.url
from scraped_products sp
where sp.price is not null
  and sp.price > 0;


create or replace view scraped_market_rollup as
with base as (
    select
        coalesce(
                nullif(regexp_replace(coalesce(sp.ean_norm, ''), '[^0-9]', '', 'g'), ''),
                nullif(regexp_replace(upper(coalesce(sp.mpn_norm, '')), '[^0-9A-Z]', '', 'g'), ''),
                nullif(regexp_replace(upper(coalesce(sp.uid_norm, '')), '[^0-9A-Z]', '', 'g'), '')
        ) as uid,
        sp.name,
        sp.brand,
        sp.ean,
        sp.mpn,
        sp.price,
        sp.last_scraped
    from scraped_products sp
    where sp.price is not null
      and sp.price > 0
)
select
    uid,
    min(name) as display_name,
    min(brand) as brand,
    min(ean) as ean,
    min(mpn) as mpn,
    count(*)::int as offers_count,
    min(price) as price_min,
    max(price) as price_max,
    percentile_cont(0.5) within group (order by price) as price_median,
    max(last_scraped) as last_scraped
from base
where uid is not null
  and uid <> ''
group by uid;