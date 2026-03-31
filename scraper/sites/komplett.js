function cleanText(v) {
    if (!v) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return s || null;
}

function cleanEan(v) {
    if (!v) return null;
    const s = String(v).replace(/\D/g, '').trim();
    if (s.length < 8 || s.length > 14) return null;
    return s;
}

function cleanMpnRaw(v) {
    if (!v) return null;
    const s = String(v).trim().toUpperCase();
    const match = s.match(/[A-Z0-9._\-\/]+/);
    if (!match) return null;
    return match[0].substring(0, 100);
}

function cleanSku(v) {
    if (!v) return null;
    return String(v).trim().substring(0, 100);
}

function parsePrice(text) {
    if (!text) return 0;

    const raw = String(text)
        .replace(/\u00a0/g, ' ')
        .replace(/kr/gi, '')
        .replace(/\s+/g, '')
        .replace(',', '.');

    const match = raw.match(/\d+(?:\.\d{1,2})?/);
    if (!match) return 0;

    const value = parseFloat(match[0]);
    return Number.isFinite(value) && value > 0 && value < 1000000 ? value : 0;
}

const komplett = {
    domain: 'komplett.se',

    extract: async (page) => {
        const openSelectors = [
            'button:has-text("Tekniska specifikationer")',
            'a:has-text("Tekniska specifikationer")',
            'button:has-text("Specifikationer")',
            'a:has-text("Specifikationer")',
            '[data-testid="specifications-button"]',
            'button:has-text("Visa mer")'
        ];

        for (const sel of openSelectors) {
            try {
                const buttons = await page.$$(sel);
                for (const btn of buttons.slice(0, 3)) {
                    try {
                        await btn.click({ timeout: 1000 });
                        await page.waitForTimeout(500);
                    } catch {}
                }
            } catch {}
        }

        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(700);

        await Promise.race([
            page.waitForSelector('script[type="application/ld+json"]', { timeout: 3500 }).catch(() => null),
            page.waitForSelector('table, tr, [class*="spec"]', { timeout: 3500 }).catch(() => null),
            page.waitForTimeout(1500)
        ]);

        return await page.evaluate(() => {
            const results = {
                name: null,
                price: 0,
                ean: null,
                mpn: null,
                sku: null,
                taxStatus: 'incl',
                _extractionPasses: 3
            };

            const textOf = (el) => (el?.innerText || el?.textContent || '').trim();
            const normalizeLabel = (s) =>
                String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

            const setIfEmpty = (key, value, cleaner = (x) => x) => {
                if (results[key]) return;
                const cleaned = cleaner(value);
                if (cleaned) results[key] = cleaned;
            };

            const nameSelectors = [
                'h1[data-testid="product-title"]',
                'h1.product-main-info__title',
                'h1.product-title',
                '[data-testid="product-name"]',
                '.product-header h1',
                'h1'
            ];

            for (const sel of nameSelectors) {
                const el = document.querySelector(sel);
                const name = cleanText(textOf(el));
                if (name && name.length > 3) {
                    results.name = name.substring(0, 500);
                    break;
                }
            }

            const priceSelectors = [
                '.product-price-now',
                '[data-testid="product-price"]',
                '.price-value',
                '.product-price',
                '[class*="price"]'
            ];

            for (const sel of priceSelectors) {
                const el = document.querySelector(sel);
                const price = parsePrice(textOf(el));
                if (price > 0) {
                    results.price = price;
                    break;
                }
            }

            // JSON-LD först
            try {
                const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of jsonScripts) {
                    try {
                        const data = JSON.parse(script.textContent || script.innerText || '');
                        const nodes = Array.isArray(data)
                            ? data
                            : (data?.['@graph'] ? data['@graph'] : [data]);

                        for (const node of nodes) {
                            if (!node) continue;
                            if (node['@type'] !== 'Product' && node['@type'] !== 'Offer') continue;

                            const eanCandidates = [
                                node.gtin13, node.gtin14, node.gtin12, node.gtin,
                                node.ean, node.ean13, node.ean14, node.productEAN
                            ];

                            for (const candidate of eanCandidates) {
                                const e = cleanEan(candidate);
                                if (e) {
                                    results.ean = e;
                                    break;
                                }
                            }

                            setIfEmpty('mpn', node.mpn || node.manufacturerPartNumber, cleanMpnRaw);
                            setIfEmpty('sku', node.sku || node.productID, cleanSku);
                            setIfEmpty('name', node.name, cleanText);

                            if ((!results.price || results.price === 0) && node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                const p = parsePrice(offer?.price);
                                if (p > 0) results.price = p;
                            }
                        }
                    } catch {}
                }
            } catch {}

            // Specs
            if (!results.ean || !results.mpn || !results.sku) {
                const allElements = Array.from(document.querySelectorAll('table, tr, th, td, dt, dd, li, [class*="spec"]'));

                for (const el of allElements) {
                    const label = normalizeLabel(textOf(el));
                    if (!label) continue;

                    const value =
                        cleanText(textOf(el.querySelector('td:last-child, .value, dd, span:last-child, [class*="value"]'))) ||
                        cleanText(textOf(el.nextElementSibling)) ||
                        cleanText(textOf(el.parentElement)) ||
                        cleanText(textOf(el));

                    if (!results.ean && (
                        label.includes('ean') ||
                        label.includes('streckkod') ||
                        label.includes('gtin') ||
                        label.includes('barcode') ||
                        label.includes('european article number')
                    )) {
                        const e = cleanEan(value) || cleanEan(textOf(el.parentElement)) || cleanEan(textOf(el));
                        if (e) results.ean = e;
                    }

                    if (!results.mpn && (
                        label.includes('tillverkarens artikelnummer') ||
                        label.includes('tillverkar artikelnummer') ||
                        label.includes('manufacturer part number') ||
                        label.includes('mpn') ||
                        label.includes('part number')
                    )) {
                        const mpn = cleanMpnRaw(value);
                        if (mpn && mpn.length > 2) results.mpn = mpn;
                    }

                    if (!results.sku && (
                        label.includes('sku') ||
                        label.includes('produktnummer') ||
                        label.includes('produkt id') ||
                        label.includes('artikel-id') ||
                        label.includes('komplett nr')
                    )) {
                        const sku = cleanSku(value);
                        if (sku) results.sku = sku;
                    }
                }
            }

            // Data-attribut / meta
            if (!results.ean) {
                const eanAttr = document.querySelector('[data-ean], [data-gtin], [data-product-ean]');
                if (eanAttr) {
                    results.ean =
                        cleanEan(eanAttr.getAttribute('data-ean')) ||
                        cleanEan(eanAttr.getAttribute('data-gtin')) ||
                        cleanEan(eanAttr.getAttribute('data-product-ean'));
                }
            }

            const bodyText = document.body ? document.body.innerText : '';

            if (!results.ean) {
                const eanPatterns = [
                    /ean[:\s]+(\d{13})/i,
                    /gtin[:\s]+(\d{13})/i,
                    /streckkod[:\s]+(\d{13})/i,
                    /\b(\d{13})\b/g
                ];

                for (const pattern of eanPatterns) {
                    const match = bodyText.match(pattern);
                    const candidate = match?.[1] || match?.[0];
                    const e = cleanEan(candidate);
                    if (e) {
                        results.ean = e;
                        break;
                    }
                }
            }

            if (!results.sku) {
                const urlMatch = window.location.pathname.match(/\/product\/(\d+)\//);
                if (urlMatch) results.sku = cleanSku(urlMatch[1]);
            }

            if (results.name) results.name = cleanText(results.name)?.substring(0, 500) || null;
            if (results.ean) results.ean = cleanEan(results.ean);
            if (results.mpn) results.mpn = cleanMpnRaw(results.mpn);
            if (results.sku) results.sku = cleanSku(results.sku);

            return results;

            function cleanText(v) {
                if (!v) return null;
                const s = String(v).replace(/\s+/g, ' ').trim();
                return s || null;
            }

            function cleanEan(v) {
                if (!v) return null;
                const s = String(v).replace(/\D/g, '').trim();
                if (s.length < 8 || s.length > 14) return null;
                return s;
            }

            function cleanMpnRaw(v) {
                if (!v) return null;
                const s = String(v).trim().toUpperCase();
                const match = s.match(/[A-Z0-9._\-\/]+/);
                if (!match) return null;
                return match[0].substring(0, 100);
            }

            function cleanSku(v) {
                if (!v) return null;
                return String(v).trim().substring(0, 100);
            }

            function parsePrice(text) {
                if (!text) return 0;
                const raw = String(text)
                    .replace(/\u00a0/g, ' ')
                    .replace(/kr/gi, '')
                    .replace(/\s+/g, '')
                    .replace(',', '.');

                const match = raw.match(/\d+(?:\.\d{1,2})?/);
                if (!match) return 0;

                const value = parseFloat(match[0]);
                return Number.isFinite(value) && value > 0 && value < 1000000 ? value : 0;
            }
        });
    }
};

module.exports = komplett;