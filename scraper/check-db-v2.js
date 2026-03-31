const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'price_engine',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
});

async function checkData() {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('  📊 PRICE SPIDER - DB CHECK (SIMPLIFIED MODEL)');
        console.log('='.repeat(70));

        console.log('\n📈 ÖVERSIKT');
        console.log('─'.repeat(70));

        const overviewRes = await pool.query(`
            select
                (select count(*) from company_listings) as total_inventory,
                (select count(*) from scraped_products) as total_scraped,
                (select count(*) from scraped_products where price is not null and price > 0) as priced_scraped,
                (select count(*) from scraped_products where ean_norm is not null and ean_norm <> '') as with_ean,
                (select count(*) from scraped_products where mpn_norm is not null and mpn_norm <> '') as with_mpn,
                (select max(last_scraped) from scraped_products) as latest_scrape
        `);

        const overview = overviewRes.rows[0];
        console.log(`   📦 Our inventory:     ${overview.total_inventory}`);
        console.log(`   🕷️ Scraped rows:      ${overview.total_scraped}`);
        console.log(`   💰 Med pris:          ${overview.priced_scraped}`);
        console.log(`   🆔 Med EAN:           ${overview.with_ean}`);
        console.log(`   🏷️ Med MPN:           ${overview.with_mpn}`);
        console.log(`   🕐 Senaste scrape:    ${overview.latest_scrape ? new Date(overview.latest_scrape).toLocaleString('sv-SE') : 'Aldrig'}`);

        console.log('\n🏪 PER BUTIK');
        console.log('─'.repeat(70));

        const siteRes = await pool.query(`
            select
                coalesce(site_name, '(unknown)') as site_name,
                count(*)::int as total_rows,
                count(*) filter (where price is not null and price > 0)::int as priced_rows,
                count(*) filter (where ean_norm is not null and ean_norm <> '')::int as with_ean,
                count(*) filter (where mpn_norm is not null and mpn_norm <> '')::int as with_mpn,
                max(last_scraped) as latest_scrape
            from scraped_products
            group by coalesce(site_name, '(unknown)')
            order by total_rows desc, site_name asc
        `);

        siteRes.rows.forEach((row) => {
            const latest = row.latest_scrape ? new Date(row.latest_scrape).toLocaleString('sv-SE') : 'Aldrig';
            console.log(`   ${String(row.site_name).padEnd(12)} | rows=${String(row.total_rows).padStart(4)} | pris=${String(row.priced_rows).padStart(4)} | EAN=${String(row.with_ean).padStart(4)} | MPN=${String(row.with_mpn).padStart(4)}`);
            console.log(`   ${''.padEnd(12)} | Senast: ${latest}`);
        });

        console.log('\n🧩 MATCHNING MOT INVENTORY');
        console.log('─'.repeat(70));

        const matchRes = await pool.query(`
            select
                count(*)::int as matched_inventory
            from company_listings c
            join scraped_market_rollup r
              on r.uid = nullif(regexp_replace(coalesce(c.ean, ''), '[^0-9]', '', 'g'), '')
              or r.uid = nullif(regexp_replace(upper(coalesce(c.mpn, '')), '[^0-9A-Z]', '', 'g'), '')
        `);

        console.log(`   ✅ Inventory med market-match: ${matchRes.rows[0].matched_inventory}`);

        console.log('\n🕐 SENASTE 10 SCRAPED PRODUKTER');
        console.log('─'.repeat(70));

        const recentRes = await pool.query(`
            select
                id,
                site_name,
                name,
                brand,
                ean,
                mpn,
                sku,
                price,
                last_scraped,
                url
            from scraped_products
            order by last_scraped desc nulls last, id desc
            limit 10
        `);

        recentRes.rows.forEach((row, i) => {
            const name = String(row.name || 'N/A').substring(0, 38).padEnd(40);
            const price = row.price ? `${Math.round(row.price)} kr`.padStart(8) : 'N/A'.padStart(8);
            const ident = row.ean || row.mpn || row.sku || 'N/A';
            console.log(`   ${(i + 1).toString().padStart(2)}. [${String(row.site_name || '?').substring(0, 3)}] ${name} ${price}`);
            console.log(`       ID: ${String(ident).substring(0, 50)}`);
            console.log(`       URL: ${String(row.url).substring(0, 80)}`);
        });

        console.log('\n' + '='.repeat(70) + '\n');
    } catch (err) {
        console.error('❌ Fel vid databas-kontroll:', err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
    }
}

checkData();