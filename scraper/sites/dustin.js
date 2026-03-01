// scraper/sites/dustin.js
module.exports = {
    domain: 'dustinhome.se',
    extract: async (page) => {
        return await page.evaluate(() => {
            const results = { name: null, price: 0, ean: null, mpn: null, taxStatus: 'unknown' };

            // 1. Försök läsa JSON-LD
            try {
                const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                for (const script of schemaScripts) {
                    const data = JSON.parse(script.innerText);
                    const product = data['@graph'] ? data['@graph'].find(i => i['@type'] === 'Product') : (data['@type'] === 'Product' ? data : null);

                    if (product) {
                        results.name = results.name || product.name;
                        results.mpn = results.mpn || product.mpn || product.sku;
                        results.ean = results.ean || product.gtin13 || product.gtin12 || product.gtin;
                        if (product.offers) {
                            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                            const p = parseFloat(offer.price);
                            if (p > 0) results.price = p;
                        }
                    }
                }
            } catch (e) {}

            // 2. DOM Fallback för pris (Dustin specifika klasser)
            if (!results.price || results.price === 0) {
                const priceSelectors = ['.price', '.actual-price', '[data-test-id="price"]', '.product-price'];
                for (const selector of priceSelectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const val = parseFloat(el.innerText.replace(/[^\d]/g, ''));
                        if (val > 0) { results.price = val; break; }
                    }
                }
            }

            // 3. NAMN Fallback
            if (!results.name) results.name = document.querySelector('h1')?.innerText.trim();

            // 4. MOMSKONTROLL
            const bodyText = document.body.innerText.toLowerCase();
            const isExclVat = bodyText.includes('exkl. moms') || bodyText.includes('excl. vat');

            if (isExclVat && results.price > 0) {
                results.taxStatus = 'excl';
                results.price = results.price * 1.25;
            } else {
                results.taxStatus = 'incl';
            }

            return results;
        });
    }
};