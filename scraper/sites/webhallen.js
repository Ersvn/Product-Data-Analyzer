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

    const raw = String(text).replace(/\u00a0/g, ' ').trim();

    const normalized = raw
        .replace(/:-/g, '')
        .replace(/kr/gi, '')
        .replace(/\s+/g, '')
        .replace(',', '.');

    const match = normalized.match(/\d+(?:\.\d{1,2})?/);
    if (!match) return 0;

    const value = parseFloat(match[0]);
    return Number.isFinite(value) && value > 0 && value < 1000000 ? value : 0;
}

module.exports = {
    domain: 'webhallen.com',

    extract: async (page) => {
        const openSelectors = [
            'button:has-text("Specifikationer")',
            'button:has-text("Teknisk specifikation")',
            'button:has-text("Tekniska specifikationer")',
            'button:has-text("Visa mer")',
            'button:has-text("Läs mer")',
            'a:has-text("Specifikationer")',
            '[data-testid*="spec"]',
            '[data-test-id*="spec"]',
            '[aria-controls*="spec"]'
        ];

        for (const sel of openSelectors) {
            try {
                const buttons = await page.$$(sel);
                for (const btn of buttons.slice(0, 4)) {
                    try {
                        await btn.click({ timeout: 1000 });
                        await page.waitForTimeout(600);
                    } catch {}
                }
            } catch {}
        }

        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(700);
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(900);

        await Promise.race([
            page.waitForSelector('script[type="application/ld+json"]', { timeout: 5000 }).catch(() => null),
            page.waitForSelector('table, .spec-item, .product-details, [class*="spec"], [class*="accordion"]', { timeout: 5000 }).catch(() => null),
            page.waitForTimeout(2200)
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
            const htmlOf = (el) => (el?.innerHTML || '').trim();

            const normalizeLabel = (s) =>
                String(s || '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();

            const setIfEmpty = (key, value, cleaner = (x) => x) => {
                if (results[key]) return;
                const cleaned = cleaner(value);
                if (cleaned) results[key] = cleaned;
            };

            function trySetEan(candidate) {
                const e = cleanEan(candidate);
                if (e) results.ean = e;
            }

            const nameSelectors = [
                'h1[data-test-id="product-name"]',
                'h1.product-name',
                '.product-title h1',
                '[data-testid="product-title"]',
                '.product-header h1',
                'main h1',
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
                '[data-test-id="product-price"]',
                '.price-value',
                '.current-price',
                '.product-price',
                '.wh-price',
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

            // JSON-LD
            try {
                const jsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of jsonScripts) {
                    try {
                        const raw = script.textContent || script.innerText || '';
                        if (!raw) continue;

                        const parsed = JSON.parse(raw);
                        const nodes = Array.isArray(parsed)
                            ? parsed
                            : (parsed?.['@graph'] ? parsed['@graph'] : [parsed]);

                        for (const node of nodes) {
                            if (!node) continue;

                            const type = node['@type'];
                            const isProduct =
                                type === 'Product' ||
                                (Array.isArray(type) && type.includes('Product'));

                            if (!isProduct) continue;

                            setIfEmpty('name', node.name, cleanText);
                            setIfEmpty('mpn', node.mpn || node.manufacturerPartNumber, cleanMpnRaw);
                            setIfEmpty('sku', node.sku || node.productID, cleanSku);

                            const eanSources = [
                                node.gtin13, node.gtin, node.ean, node.ean13, node.gtin14, node.gtin12, node.productEAN
                            ];

                            for (const src of eanSources) {
                                if (!results.ean) trySetEan(src);
                            }

                            if ((!results.price || results.price === 0) && node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                const p = parsePrice(offer?.price);
                                if (p > 0) results.price = p;
                            }
                        }
                    } catch {}
                }
            } catch {}

            // Data-attribut / meta
            if (!results.ean) {
                const eanSelectors = [
                    '[data-ean]',
                    '[data-gtin]',
                    '[data-product-ean]',
                    '[data-barcode]',
                    '[data-product-code]'
                ];

                for (const sel of eanSelectors) {
                    const el = document.querySelector(sel);
                    if (!el) continue;

                    const attrs = ['data-ean', 'data-gtin', 'data-product-ean', 'data-barcode', 'data-product-code'];
                    for (const attr of attrs) {
                        const val = cleanEan(el.getAttribute(attr));
                        if (val) {
                            results.ean = val;
                            break;
                        }
                    }
                    if (results.ean) break;
                }
            }

            if (!results.ean) {
                const metaSelectors = [
                    'meta[property="og:upc"]',
                    'meta[property="product:ean"]',
                    'meta[name="ean"]',
                    'meta[name="gtin"]',
                    'meta[property="product:gtin13"]'
                ];

                for (const sel of metaSelectors) {
                    const meta = document.querySelector(sel);
                    const val = cleanEan(meta?.getAttribute('content'));
                    if (val) {
                        results.ean = val;
                        break;
                    }
                }
            }

            // Specs / tabeller
            const specContainers = Array.from(document.querySelectorAll(`
                table,
                tr,
                th,
                td,
                .spec-item,
                .specification-row,
                .product-spec li,
                .product-details tr,
                .tech-specs tr,
                [class*="spec"],
                [class*="accordion"],
                [class*="attribute"]
            `));

            for (const el of specContainers) {
                const label = normalizeLabel(textOf(el));
                if (!label) continue;

                const valueEl = el.querySelector('td:last-child, .value, dd, span:last-child, [class*="value"]');
                const value =
                    cleanText(textOf(valueEl)) ||
                    cleanText(textOf(el.nextElementSibling)) ||
                    cleanText(textOf(el.parentElement)) ||
                    cleanText(textOf(el));

                if (!results.mpn && (
                    label.includes('tillverkarens artikelnr') ||
                    label.includes('tillverkar artikelnummer') ||
                    label.includes('manufacturer part number') ||
                    label.includes('mpn') ||
                    label.includes('tillverkarens kod')
                )) {
                    const mpn =
                        cleanMpnRaw(value) ||
                        cleanMpnRaw(textOf(el.parentElement)) ||
                        cleanMpnRaw(textOf(el));
                    if (mpn && mpn.length > 2) results.mpn = mpn;
                }

                if (!results.ean && (
                    label.includes('ean') ||
                    label.includes('streckkod') ||
                    label.includes('gtin') ||
                    label.includes('barcode') ||
                    label.includes('european article')
                )) {
                    const eanMatch =
                        cleanEan(value) ||
                        cleanEan(textOf(el.parentElement)) ||
                        cleanEan(textOf(el)) ||
                        cleanEan(htmlOf(el));
                    if (eanMatch) results.ean = eanMatch;
                }

                if (!results.sku && (
                    label.includes('sku') ||
                    label.includes('produktnummer') ||
                    label.includes('webhallen-nr') ||
                    label.includes('webhallen nummer') ||
                    label.includes('artikel-id') ||
                    label.includes('produkt id')
                )) {
                    const skuMatch =
                        cleanSku(value) ||
                        cleanSku(textOf(el.parentElement)) ||
                        cleanSku(textOf(el));
                    if (skuMatch) results.sku = skuMatch;
                }
            }

            const bodyText = document.body ? document.body.innerText : '';

            if (!results.ean) {
                const patterns = [
                    /ean[\s:]+(\d{13,14})/i,
                    /streckkod[\s:]+(\d{13,14})/i,
                    /gtin(?:-13)?[\s:]+(\d{13,14})/i
                ];

                for (const pattern of patterns) {
                    const match = bodyText.match(pattern);
                    const candidate = match?.[1];
                    const e = cleanEan(candidate);
                    if (e) {
                        results.ean = e;
                        break;
                    }
                }
            }

            if (!results.mpn) {
                const patterns = [
                    /tillverkarens artikelnummer[\s:]+([A-Z0-9._\-\/]+)/i,
                    /tillverkar artikelnummer[\s:]+([A-Z0-9._\-\/]+)/i,
                    /manufacturer part number[\s:]+([A-Z0-9._\-\/]+)/i,
                    /mpn[\s:]+([A-Z0-9._\-\/]+)/i
                ];

                for (const pattern of patterns) {
                    const match = bodyText.match(pattern);
                    const candidate = cleanMpnRaw(match?.[1]);
                    if (candidate && candidate.length > 2) {
                        results.mpn = candidate;
                        break;
                    }
                }
            }

            if (!results.sku) {
                const urlMatch = window.location.pathname.match(/\/product\/(\d+)-/);
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
                const raw = String(text).replace(/\u00a0/g, ' ').trim();
                const normalized = raw
                    .replace(/:-/g, '')
                    .replace(/kr/gi, '')
                    .replace(/\s+/g, '')
                    .replace(',', '.');

                const match = normalized.match(/\d+(?:\.\d{1,2})?/);
                if (!match) return 0;

                const value = parseFloat(match[0]);
                return Number.isFinite(value) && value > 0 && value < 1000000 ? value : 0;
            }
        });
    }
};