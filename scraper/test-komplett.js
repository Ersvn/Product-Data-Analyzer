// scraper/test-komplett.js
const { getBrowserContext } = require('./lib/browser');
const komplett = require('./sites/komplett');
const { saveScrapedData } = require('./lib/db');

async function runTest() {
    // NY URL: Komplett-PC Epic Gaming
    const testUrl = 'https://www.komplett.se/product/1320517/gaming/gamingdator/gamingdator-stationar/komplett-pc-epic-gaming-a275-rgb?';

    console.log('--- 🚀 STARTAR TEST MOT KOMPLETT (NY PRODUKT) ---');

    const { browser, context } = await getBrowserContext();
    const page = await context.newPage();

    try {
        console.log(`🔗 Navigerar till: ${testUrl}`);
        // Vi använder 'load' för att vara säkra på att allt innehåll landat
        await page.goto(testUrl, { waitUntil: 'load', timeout: 60000 });

        console.log('🍪 Hanterar cookie-val...');
        try {
            // Letar efter knappen "Acceptera alla"
            const cookieBtn = page.getByRole('button', { name: /acceptera|godkänn/i });
            if (await cookieBtn.isVisible({ timeout: 5000 })) {
                await cookieBtn.click();
                console.log('✅ Cookies godkända.');
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            console.log('ℹ️ Ingen cookie-ruta dök upp.');
        }

        // Kontrollera titeln så vi vet att vi är rätt
        const title = await page.title();
        console.log(`📝 Sidan laddad: "${title}"`);

        console.log('⏳ Väntar på att priset ska renderas...');
        // Vänta på prisselektorn (från din devtools-spaning)
        await page.waitForSelector('.product-price-now', { state: 'visible', timeout: 10000 });

        console.log('🧐 Extraherar data...');
        const data = await komplett.extract(page);

        if (data && data.price > 0) {
            const result = {
                url: testUrl,
                price: data.price,
                ean: data.ean || 'PC-BYGGE', // PC-byggen har sällan EAN, men vi testar
                mpn: data.mpn || 'EPIC-A275',
                site_name: 'Komplett'
            };

            console.log('💎 RESULTAT HITTAT:');
            console.table(result);

            await saveScrapedData(result);
            console.log('✨ Sparat i Postgres!');
        } else {
            console.error('❌ Hittade inget pris för denna dator.');
            console.log('Debug-data:', data);
            await page.screenshot({ path: 'debug_pc.png' });
        }

    } catch (err) {
        console.error('💥 Fel under körning:', err.message);
    } finally {
        await browser.close();
        console.log('--- 🏁 TEST AVSLUTAT ---');
        process.exit();
    }
}

runTest();