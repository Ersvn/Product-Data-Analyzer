-- =========
-- Core tables
-- =========

create table if not exists products (
                                        id bigserial primary key,
                                        ean varchar(32) unique,
    mpn varchar(128),
    name text,
    brand varchar(128),
    category varchar(255),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
    );

create index if not exists idx_products_brand on products(brand);
create index if not exists idx_products_category on products(category);

create table if not exists product_identifiers (
                                                   id bigserial primary key,
                                                   product_id bigint not null references products(id) on delete cascade,
    type varchar(16) not null,              -- 'EAN','MPN','SKU'
    value text not null,
    normalized_value text not null,
    source varchar(64),
    confidence int default 0,
    created_at timestamptz default now()
    );

-- du kör: on conflict (type, normalized_value) do nothing
create unique index if not exists ux_ident_type_norm on product_identifiers(type, normalized_value);
create index if not exists idx_ident_product on product_identifiers(product_id);

create table if not exists merchants (
                                         id bigserial primary key,
                                         name varchar(128) not null unique,
    country varchar(2) default 'SE',
    active boolean default true,
    created_at timestamptz default now()
    );

create table if not exists offers (
                                      id bigserial primary key,
                                      product_id bigint not null references products(id) on delete cascade,
    merchant_id bigint not null references merchants(id) on delete cascade,
    price numeric(12,2) not null,
    currency varchar(3) default 'SEK',
    in_stock boolean default true,
    url text,
    fetched_at timestamptz default now()
    );

-- du kör: on conflict (product_id, merchant_id) do update
create unique index if not exists ux_offers_product_merchant on offers(product_id, merchant_id);
create index if not exists idx_offers_product on offers(product_id);
create index if not exists idx_offers_fetched_at on offers(fetched_at desc);

create table if not exists company_listings (
                                                id bigserial primary key,
                                                company_sku varchar(140) not null unique, -- 'EAN:..' / 'MPN:..' / 'SKU:..'
    ean varchar(32),
    mpn varchar(128),
    name text,
    brand varchar(128),
    category varchar(255),
    cost_price numeric(12,2),
    our_price numeric(12,2),
    price_mode varchar(16) default 'AUTO',    -- matchar din app
    manual_price numeric(12,2),
    matched_product_id bigint references products(id) on delete set null,
    last_updated timestamptz default now()
    );

create index if not exists idx_company_ean on company_listings(ean);
create index if not exists idx_company_matched on company_listings(matched_product_id);

-- =========
-- View used by DbMarketController / DbProductViewController / DbPricingController
-- =========

create or replace view product_market_snapshot as
select
    o.product_id,
    count(*)::int as offers_count,
    min(o.price) as price_min,
    max(o.price) as price_max,
    percentile_cont(0.5) within group (order by o.price) as price_median,
  percentile_cont(0.5) within group (order by o.price) as benchmark_price
from offers o
where o.price is not null
group by o.product_id;