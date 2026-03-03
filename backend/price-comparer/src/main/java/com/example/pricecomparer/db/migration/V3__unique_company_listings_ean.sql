ALTER TABLE company_listings DROP CONSTRAINT IF EXISTS uq_company_listings_ean;

CREATE UNIQUE INDEX IF NOT EXISTS ux_company_listings_ean_not_blank
    ON company_listings (ean)
    WHERE ean IS NOT NULL AND ean <> '';