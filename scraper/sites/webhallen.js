// scraper/sites/webhallen.js
module.exports = {
    domain: 'webhallen.com',
    extract: async (page) => {
        return await page.evaluate(() => {
            const results = { name: null, price: 0, ean: null, mpn: null, taxStatus: 'incl' };

            // 1. Namn
            results.name = document.querySelector('h1')?.innerText.trim();

            // 2. Pris (Säkrad logik)
            const priceContainer = document.querySelector('.price-value, [data-test-id="product-price"]');
            if (priceContainer) {
                // Vi hämtar texten och tar bara det första sammanhängande numret (innan ev. mellanslag/skräp)
                const rawPrice = priceContainer.innerText.replace(/\s/g, ''); // Ta bort alla mellanslag
                const match = rawPrice.match(/\d+/); // Hitta första klumpen av siffror
                if (match) {
                    results.price = parseFloat(match[0]);
                }
            }

            // 3. EAN & MPN (Letar i specifikationstabellen)
            // Vi letar i både .spec-item och vanliga tabellceller
            const allElements = Array.from(document.querySelectorAll('.spec-item, tr, dt, li'));

            allElements.forEach(el => {
                const text = el.innerText.toLowerCase();

                // Vi letar efter värdet som oftast ligger i en span eller td inuti elementet
                const valueElem = el.querySelector('.value, td:last-child, span:last-child');
                const value = valueElem ? valueElem.innerText.trim() : "";

                // MPN (Tillverkarens artikelnr)
                if (text.includes('tillverkarens artikelnr') || text.includes('mpn')) {
                    // Om det finns ett tydligt värde-element, ta det, annars försök parsa texten
                    results.mpn = value || text.split('artikelnr')[1]?.trim();
                }

                // EAN
                if (text.includes('ean') || text.includes('streckkod')) {
                    const eanMatch = (value || text).match(/\d{10,13}/);
                    if (eanMatch) results.ean = eanMatch[0];
                }
            });

            // Städning av MPN (ta bort eventuella rester av etiketten)
            if (results.mpn) {
                results.mpn = results.mpn.replace(/tillverkarens artikelnr/gi, '').trim();
            }

            return results;
        });
    }
};