const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'price_engine',
    password: 'admin123',
    port: 5432,
});

async function isProductFresh(url, hours = 24) {
    try {
        // Vi ändrar "id" till "1" för att slippa kolumn-beroende
        const res = await pool.query(
            `SELECT 1 FROM scraped_products
             WHERE url = $1
               AND last_scraped > NOW() - INTERVAL '${hours} hours'
                 LIMIT 1`,
            [url]
        );
        return res.rows.length > 0;
    } catch (err) {
        console.error('❌ [Cache Check Error]', err.message);
        return false;
    }
}

async function saveScrapedData(data) {
    const query = `
        INSERT INTO scraped_products (url, name, price, ean, mpn, site_name, last_scraped)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (url) DO UPDATE SET
            name = EXCLUDED.name,
            price = EXCLUDED.price,
            ean = EXCLUDED.ean,
            mpn = EXCLUDED.mpn,
            last_scraped = NOW();
    `;

    try {
        await pool.query(query, [
            data.url,
            data.name || 'Okänt namn',
            data.price,
            data.ean || 'N/A',
            data.mpn || 'N/A',
            data.site_name
        ]);
        console.log(`✅ [DB] Synkad: ${data.name || data.url.split('/').pop()}`);
    } catch (err) {
        console.error('❌ [DB Error]', err.message);
    }
}

module.exports = { saveScrapedData, isProductFresh };