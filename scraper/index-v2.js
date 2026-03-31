const { getBrowserContext } = require('./lib/browser');
const komplett = require('./sites/komplett');
const dustin = require('./sites/dustin');
const webhallen = require('./sites/webhallen');
const { processScrapedProduct, getProductByEan, getProductHistory } = require('./lib/db-v2');
async function testSingleScrape(url) {
    console.log(`\n🔍 Testar scraping av: ${url}\n`);
    
    const { browser, context } = await getBrowserContext();
    const page = await context.newPage();

    try {
        // Välj rätt extractor
        const siteKey = url.includes('dustin') ? 'dustin' : 
                       url.includes('webhallen') ? 'webhallen' : 'komplett';
        const extractor = siteKey === 'dustin' ? dustin : 
                         siteKey === 'webhallen' ? webhallen : komplett;

        console.log(`🌐 Navigerar till ${siteKey}...`);
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });
        
        // Vänta på pris-element
        await page.waitForSelector('.price-value, [data-test-id="product-price"], .product-price-now, .price', 
            { timeout: 10000 }).catch(() => {});

        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(600);

        console.log('📊 Extraherar data...\n');
        const data = await extractor.extract(page);

        if (data && data.price > 0) {
            console.log('✅ Hittad data:');
            console.log('─'.repeat(60));
            console.log(`   Namn:  ${data.name}`);
            console.log(`   Pris:  ${Math.round(data.price)} kr (${data.taxStatus === 'excl' ? 'exkl. moms' : 'inkl. moms'})`);
            console.log(`   EAN:   ${data.ean || 'N/A'}`);
            console.log(`   MPN:   ${data.mpn || 'N/A'}`);
            console.log(`   SKU:   ${data.sku || 'N/A'}`);
            console.log('─'.repeat(60));
            
            // Kolla om produkten redan finns
            if (data.ean) {
                const existing = await getProductByEan(data.ean);
                if (existing) {
                    console.log('\n📦 PRODUKTEN FINNS REDAN I DATABASEN:');
                    console.log(`   ID: ${existing.id}`);
                    console.log(`   Namn: ${existing.name}`);
                    console.log(`   Senaste pris: ${existing.latest_price} kr`);
                    console.log(`   URLs: ${existing.urls.length} st`);
                    existing.urls.forEach(u => {
                        console.log(`      - [${u.site}] ${u.url.substring(0, 50)}...`);
                    });
                    
                    // Visa pris-historik
                    const history = await getProductHistory(existing.id);
                    if (history.length > 1) {
                        console.log('\n📈 PRISHISTORIK (senaste 5):');
                        history.slice(0, 5).forEach(h => {
                            const date = new Date(h.scraped_at).toLocaleString('sv-SE');
                            console.log(`   ${date}: ${Math.round(h.price)} kr [${h.source_site}]`);
                        });
                    }
                }
            }
            
            // Fråga om vi ska spara
            console.log('\n💾 Vill du spara denna produkt? (y/n)');
            
            // För automatisk körning, spara direkt
            if (process.argv.includes('--save')) {
                console.log('   Sparar automatiskt (--save flag)...');
                
                const result = await processScrapedProduct({
                    url,
                    siteName: siteKey.charAt(0).toUpperCase() + siteKey.slice(1),
                    name: data.name,
                    price: data.price,
                    ean: data.ean,
                    mpn: data.mpn,
                    sku: data.sku,
                    brand: data.brand,
                    currency: 'SEK',
                    taxStatus: data.taxStatus || 'incl'
                });
                
                console.log('\n✅ RESULTAT:');
                console.log(`   Åtgärd: ${result.action}`);
                console.log(`   Matchning: ${result.matchType}`);
                console.log(`   Produkt ID: ${result.productId}`);
                console.log(`   Meddelande: ${result.message}`);
                
                if (result.warning) {
                    console.log('\n   ⚠️  VARNING: Misstänkt produktbyte upptäckt!');
                    console.log('      Kör "node check-db-v2.js" för att granska.');
                }
            }
            
        } else {
            console.log('❌ Kunde inte hitta pris på denna sida.');
        }

    } catch (error) {
        console.error('💥 Fel:', error.message);
    } finally {
        await browser.close();
        process.exit(0);
    }
}

// Hämta URL från kommandoraden
const url = process.argv[2];

if (!url || url.startsWith('--')) {
    console.log('Användning:');
    console.log('  node index-v2.js "<URL>" [--save]');
    console.log('');
    console.log('Exempel:');
    console.log('  node index-v2.js "https://www.komplett.se/product/123456/produkt-namn" --save');
    console.log('');
    process.exit(0);
}

testSingleScrape(url);
