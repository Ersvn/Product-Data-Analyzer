const komplett = {
    extract: async (page) => {
        try {
            const specBtn = await page.$('button:has-text("Tekniska specifikationer"), a:has-text("Tekniska specifikationer")');
            if (specBtn) {
                await specBtn.click();
                await page.waitForTimeout(800);
            }
        } catch (e) {}

        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(500);

        return await page.evaluate(() => {
            const getPrice = () => {
                const priceEl = document.querySelector('.product-price-now, .price-value, [data-test-id="product-price"]');
                if (!priceEl) return 0;
                return parseFloat(priceEl.innerText.replace(/[^\d]/g, ''));
            };

            const getName = () => {
                const nameEl = document.querySelector('h1, .product-main-info__title');
                return nameEl ? nameEl.innerText.trim() : 'Okänd produkt';
            };

            const getSpecs = () => {
                let mpn = null;
                let ean = null;

                // --- 1. JSON-LD (Snabbt & Exakt) ---
                const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
                jsonScripts.forEach(script => {
                    try {
                        const data = JSON.parse(script.innerText);
                        const products = Array.isArray(data) ? data : [data];
                        products.forEach(p => {
                            if (p.gtin13 || p.gtin) ean = p.gtin13 || p.gtin;
                            if (p.mpn) mpn = p.mpn;
                        });
                    } catch (e) {}
                });

                // --- 2. TABELL-LOGIK (Din originalkod) ---
                if (!ean || !mpn || ean === 'N/A' || mpn === 'N/A') {
                    const allRows = Array.from(document.querySelectorAll('tr, .product-info-row'));
                    for (const row of allRows) {
                        const label = row.innerText.toLowerCase();
                        const value = row.querySelector('td:last-child, .value')?.innerText.trim();
                        if (!value) continue;

                        if (label.includes('tillverkarens artikelnummer') || label.includes('mpn')) {
                            mpn = value;
                        }
                        if (label.includes('ean') || (label.includes('streckkod') && value.length >= 10)) {
                            ean = value;
                        }
                    }
                }

                // --- 3. REGEX-DAMMSUGARE (Din originalkod) ---
                if (!ean || ean === 'N/A' || !mpn || mpn === 'N/A') {
                    const bodyText = document.body.innerText;
                    if (!ean || ean === 'N/A') {
                        const eanMatch = bodyText.match(/\b\d{13}\b/);
                        if (eanMatch) ean = eanMatch[0];
                    }
                    if (!mpn || mpn === 'N/A') {
                        const mpnMatch = bodyText.match(/(?:Tillverkarens artikelnummer|Producentens artikelnr):\s*([A-Z0-9-]+)/i);
                        if (mpnMatch) mpn = mpnMatch[1];
                    }
                }

                return {
                    mpn: mpn ? mpn.toString().trim() : 'N/A',
                    ean: ean ? ean.toString().trim() : 'N/A'
                };
            };

            const specs = getSpecs();
            return {
                name: getName(),
                price: getPrice(),
                mpn: specs.mpn,
                ean: specs.ean
            };
        });
    }
};

module.exports = komplett;