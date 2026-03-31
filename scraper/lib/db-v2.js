const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'price_engine',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
    console.error('Oväntat DB-fel:', err);
});

function generateBatchId() {
    return `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanText(value, max = 500) {
    if (value == null) return null;
    const s = String(value).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    return s.substring(0, max);
}

function normEan(value) {
    if (!value) return null;
    const s = String(value).replace(/\D/g, '').trim();
    if (s.length < 8 || s.length > 14) return null;
    return s;
}

function normMpn(value) {
    if (!value) return null;
    const s = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    return s || null;
}

function normSku(value) {
    if (!value) return null;
    const s = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    return s || null;
}

function chooseUidNorm({ ean, mpn, sku }) {
    return normEan(ean) || normMpn(mpn) || normSku(sku) || null;
}

function chooseBetterName(currentName, incomingName) {
    const current = cleanText(currentName);
    const incoming = cleanText(incomingName);

    if (!current) return incoming;
    if (!incoming) return current;

    if (current.toUpperCase().startsWith('EAN:') && !incoming.toUpperCase().startsWith('EAN:')) {
        return incoming;
    }

    return incoming.length > current.length ? incoming : current;
}

function extractBrandFromName(name) {
    if (!name) return null;

    const commonBrands = [
        'ASUS', 'MSI', 'Gigabyte', 'ASRock', 'EVGA', 'Sapphire', 'XFX', 'PowerColor',
        'Intel', 'AMD', 'NVIDIA', 'Corsair', 'Kingston', 'Crucial', 'Samsung',
        'Western Digital', 'WD', 'Seagate', 'Cooler Master', 'NZXT', 'Fractal Design',
        'Be Quiet', 'Noctua', 'Arctic', 'Logitech', 'Razer', 'SteelSeries',
        'HyperX', 'Dell', 'HP', 'Lenovo', 'Acer', 'Apple', 'Sony',
        'Philips', 'LG', 'BenQ', 'AOC', 'ViewSonic', 'Eizo'
    ];

    const upperName = String(name).toUpperCase();

    for (const brand of commonBrands) {
        if (upperName.includes(brand)) {
            return brand;
        }
    }

    const firstWord = String(name).split(/[\s\-]/)[0];
    if (firstWord && firstWord.length > 1) {
        return firstWord;
    }

    return null;
}

async function upsertScrapedProduct(scrapedData, options = {}) {
    const {
        url,
        siteName,
        name,
        price,
        ean,
        mpn,
        sku,
        brand,
        category,
        currency = 'SEK',
        inStock = true,
        batchId = generateBatchId(),
    } = scrapedData;

    const client = await pool.connect();

    const normalized = {
        url: cleanText(url, 1000),
        siteName: cleanText(siteName, 100),
        name: cleanText(name, 500),
        price: Number(price),
        ean: normEan(ean),
        mpnRaw: cleanText(mpn, 100),
        mpnNorm: normMpn(mpn),
        skuRaw: cleanText(sku, 100),
        skuNorm: normSku(sku),
        brand: cleanText(brand || extractBrandFromName(name), 100),
        category: cleanText(category, 150),
        currency: cleanText(currency, 3) || 'SEK',
        inStock: Boolean(inStock),
        batchId,
    };

    try {
        if (!normalized.url) {
            throw new Error('Saknar url');
        }

        if (!normalized.name || normalized.name.length < 2) {
            throw new Error('Saknar giltigt namn');
        }

        if (!Number.isFinite(normalized.price) || normalized.price <= 0 || normalized.price > 1000000) {
            throw new Error('Ogiltigt pris');
        }

        const uidNorm = chooseUidNorm({
            ean: normalized.ean,
            mpn: normalized.mpnRaw,
            sku: normalized.skuRaw,
        });

        const existing = await client.query(
            `
            select id, name, price, ean, mpn, sku, brand, site_name, updated_at
            from scraped_products
            where lower(url) = lower($1)
            limit 1
            `,
            [normalized.url]
        );

        const existingRow = existing.rows[0] || null;
        const finalName = chooseBetterName(existingRow?.name, normalized.name);

        const result = await client.query(
            `
            insert into scraped_products (
                url,
                site_name,
                name,
                brand,
                ean,
                mpn,
                sku,
                price,
                currency,
                in_stock,
                last_scraped,
                last_scanned,
                ean_norm,
                mpn_norm,
                uid_norm,
                created_at,
                updated_at
            )
            values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                now(), now(), $11, $12, $13, now(), now()
            )
            on conflict (url) do update set
                site_name    = excluded.site_name,
                name         = excluded.name,
                brand        = coalesce(excluded.brand, scraped_products.brand),
                ean          = coalesce(excluded.ean, scraped_products.ean),
                mpn          = coalesce(excluded.mpn, scraped_products.mpn),
                sku          = coalesce(excluded.sku, scraped_products.sku),
                price        = excluded.price,
                currency     = excluded.currency,
                in_stock     = excluded.in_stock,
                last_scraped = now(),
                last_scanned = now(),
                ean_norm     = coalesce(excluded.ean_norm, scraped_products.ean_norm),
                mpn_norm     = coalesce(excluded.mpn_norm, scraped_products.mpn_norm),
                uid_norm     = coalesce(excluded.uid_norm, scraped_products.uid_norm),
                updated_at   = now()
            returning id, url, site_name, name, brand, ean, mpn, sku, price, uid_norm, updated_at
            `,
            [
                normalized.url,
                normalized.siteName,
                finalName,
                normalized.brand,
                normalized.ean,
                normalized.mpnRaw,
                normalized.skuRaw,
                normalized.price,
                normalized.currency,
                normalized.inStock,
                normalized.ean,
                normalized.mpnNorm,
                uidNorm,
            ]
        );

        const row = result.rows[0];
        const action = existingRow ? 'updated' : 'created';

        return {
            success: true,
            action,
            rowId: row.id,
            batchId: normalized.batchId,
            message: action === 'created'
                ? 'Ny scraped produkt skapad'
                : 'Scraped produkt uppdaterad',
            row,
        };
    } finally {
        client.release();
    }
}

async function getScrapedStats() {
    const result = await pool.query(`
        select
            count(*)::int as total_rows,
            count(*) filter (where price is not null and price > 0)::int as rows_with_price,
            count(*) filter (where ean_norm is not null and ean_norm <> '')::int as rows_with_ean,
            count(*) filter (where mpn_norm is not null and mpn_norm <> '')::int as rows_with_mpn,
            max(last_scraped) as latest_scrape
        from scraped_products
    `);

    return result.rows[0];
}

async function getRowsBySite() {
    const result = await pool.query(`
        select
            coalesce(site_name, '(unknown)') as site_name,
            count(*)::int as rows,
            count(*) filter (where price is not null and price > 0)::int as priced_rows,
            max(last_scraped) as latest_scrape
        from scraped_products
        group by coalesce(site_name, '(unknown)')
        order by rows desc, site_name asc
    `);

    return result.rows;
}

async function closeDb() {
    await pool.end();
}

module.exports = {
    pool,
    upsertScrapedProduct,
    generateBatchId,
    getScrapedStats,
    getRowsBySite,
    closeDb,
    extractBrandFromName,
    normEan,
    normMpn,
    normSku,
    chooseUidNorm,
};