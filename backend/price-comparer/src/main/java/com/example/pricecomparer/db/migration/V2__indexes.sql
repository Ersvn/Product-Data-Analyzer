create index if not exists idx_company_ean_last_updated
    on company_listings(ean, last_updated desc);

create index if not exists idx_offers_product_price
    on offers(product_id, price asc);