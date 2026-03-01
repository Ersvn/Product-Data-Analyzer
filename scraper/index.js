const { getBrowserContext } = require('./lib/browser');
const komplett = require('./sites/komplett');
const { saveProduct } = require('./lib/db');

async function testSingleScrape(url) {
    const { browser, context } = await getBrowserContext();
    const page = await context.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle' });

        // Kör Komplett-extraheringen
        const productData = await komplett.extract(page);

        if (productData.price) {
            const finalResult = { url, ...productData };
            console.log('Hittad data:', finalResult);

            // SPARA TILL DB
            await saveProduct(finalResult);
        } else {
            console.log('Kunde inte hitta pris på denna sida.');
        }

    } catch (error) {
        console.error('Något gick fel:', error);
    } finally {
        await browser.close();
    }
}

// Kör testet
testSingleScrape('https://www.komplett.se/product/123456/exempel-produkt');