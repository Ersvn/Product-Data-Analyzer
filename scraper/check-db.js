const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'price_engine',
    password: 'din_lösenord_här',
    port: 5432,
});

async function checkData() {
    const res = await pool.query('SELECT site_name, price, ean, mpn, last_scraped FROM scraped_products ORDER BY last_scraped DESC LIMIT 10');
    console.log('📊 SENASTE 10 PRODUKTERNA I DATABASEN:');
    console.table(res.rows);
    await pool.end();
}

checkData();