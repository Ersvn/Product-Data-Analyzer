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

module.exports = {
    domain: 'dustinhome.se',

    extract: async (page) => {
        const openSelectors = [
            'button:has-text("Teknisk specifikation")',
            'button:has-text("Tekniska specifikationer")',
            'button:has-text("Specifikationer")',
            'a:has-text("Specifikationer")',
            'button:has-text("Visa mer")',
            'button:has-text("Läs mer")',
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

        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(900);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(800);

        await Promise.race([
            page.waitForSelector('script[type="application/ld+json"]', { timeout: 5000 }).catch(() => null),
            page.waitForSelector('table, tr, .specification-row, [class*="spec"], [class*="accordion"]', { timeout: 5000 }).catch(() => null),
            page.waitForTimeout(2200)
        ]);

        return await page.evaluate(() => {
            const results = {
                name: null,
                price: 0,
                ean: null,
                mpn: null,
                sku: null,
                taxStatus: 'unknown',
                _extractionPasses: 3
            };

            const textOf = (el) => (el?.innerText || el?.textContent || '').trim();
            const htmlOf = (el) => (el?.innerHTML || '').trim();
            const normalizeLabel = (s) =>
                String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

            const setIfEmpty = (key, value, cleaner = (x) => x) => {
                if (results[key]) return;
                const cleaned = cleaner(value);
                if (cleaned) results[key] = cleaned;
            };

            function trySetEan(candidate) {
                const e = cleanEan(candidate);
                if (e) results.ean = e;
            }

            // JSON-LD först
            try {
                const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of schemaScripts) {
                    try {
                        const raw = script.textContent || script.innerText || '';
                        if (!raw) continue;

                        const parsed = JSON.parse(raw);
                        const candidates = [];

                        if (Array.isArray(parsed)) {
                            candidates.push(...parsed);
                        } else if (parsed?.['@graph'] && Array.isArray(parsed['@graph'])) {
                            candidates.push(...parsed['@graph']);
                        } else {
                            candidates.push(parsed);
                        }

                        for (const node of candidates) {
                            if (!node) continue;
                            if (node['@type'] !== 'Product' && !(Array.isArray(node['@type']) && node['@type'].includes('Product'))) {
                                continue;
                            }

                            setIfEmpty('name', node.name, cleanText);
                            setIfEmpty('mpn', node.mpn || node.manufacturerPartNumber, cleanMpnRaw);
                            setIfEmpty('sku', node.sku || node.productID, cleanSku);

                            const gtinVariants = [
                                node.gtin13, node.gtin12, node.gtin14,
                                node.gtin, node.ean, node.ean13, node.productEAN
                            ];

                            for (const gtin of gtinVariants) {
                                if (!results.ean) trySetEan(gtin);
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

            // Pris fallback
            if (!results.price || results.price === 0) {
                const priceSelectors = [
                    '[data-test-id="price"]',
                    '.actual-price',
                    '.product-price',
                    '.current-price',
                    '.price',
                    '.dustin-price',
                    '[class*="price"]'
                ];

                for (const selector of priceSelectors) {
                    const el = document.querySelector(selector);
                    const p = parsePrice(textOf(el));
                    if (p > 0) {
                        results.price = p;
                        break;
                    }
                }
            }

            // Namn fallback
            if (!results.name) {
                const nameSelectors = [
                    'h1[data-test-id="product-name"]',
                    'h1.product-name',
                    '[data-test-id="product-title"]',
                    '.product-header h1',
                    'main h1',
                    'h1'
                ];

                for (const selector of nameSelectors) {
                    const el = document.querySelector(selector);
                    const name = cleanText(textOf(el));
                    if (name && name.length > 3) {
                        results.name = name.substring(0, 500);
                        break;
                    }
                }
            }

            // Meta / data-attribut
            if (!results.ean) {
                const metaSelectors = [
                    'meta[property="product:ean"]',
                    'meta[name="ean"]',
                    'meta[name="gtin"]',
                    'meta[property="product:gtin13"]'
                ];

                for (const sel of metaSelectors) {
                    const meta = document.querySelector(sel);
                    const e = cleanEan(meta?.getAttribute('content'));
                    if (e) {
                        results.ean = e;
                        break;
                    }
                }
            }

            if (!results.ean) {
                const dataNodes = Array.from(document.querySelectorAll('[data-ean], [data-gtin], [data-product-ean], [data-barcode]'));
                for (const node of dataNodes) {
                    const attrs = ['data-ean', 'data-gtin', 'data-product-ean', 'data-barcode'];
                    for (const attr of attrs) {
                        const e = cleanEan(node.getAttribute(attr));
                        if (e) {
                            results.ean = e;
                            break;
                        }
                    }
                    if (results.ean) break;
                }
            }

            // Specs / tabeller / accordion
            const specNodes = Array.from(document.querySelectorAll(
                `
                table, tr, th, td,
                .specification-row, .spec-item,
                dl dt, dl dd,
                .product-spec li,
                [class*="spec"],
                [class*="accordion"],
                [class*="attribute"]
                `
            ));

            for (const el of specNodes) {
                const label = normalizeLabel(textOf(el));
                if (!label) continue;

                let value =
                    cleanText(textOf(el.querySelector('td:last-child, .value, dd, span:last-child, [class*="value"]'))) ||
                    cleanText(textOf(el.nextElementSibling)) ||
                    cleanText(textOf(el.parentElement)) ||
                    cleanText(textOf(el));

                if (!results.ean && (
                    label.includes('ean') ||
                    label.includes('streckkod') ||
                    label.includes('gtin') ||
                    label.includes('barcode') ||
                    label.includes('european article')
                )) {
                    const e =
                        cleanEan(value) ||
                        cleanEan(textOf(el.parentElement)) ||
                        cleanEan(textOf(el)) ||
                        cleanEan(htmlOf(el));
                    if (e) results.ean = e;
                }

                if (!results.mpn && (
                    label.includes('tillverkarens artikelnummer') ||
                    label.includes('tillverkar artikelnummer') ||
                    label.includes('manufacturer part number') ||
                    label.includes('mpn') ||
                    label.includes('tillverkarens nr') ||
                    label.includes('artikelnr tillverkare')
                )) {
                    const mpn =
                        cleanMpnRaw(value) ||
                        cleanMpnRaw(textOf(el.parentElement)) ||
                        cleanMpnRaw(textOf(el));
                    if (mpn && mpn.length > 2) results.mpn = mpn;
                }

                if (!results.sku && (
                    label.includes('dustin sku') ||
                    label.includes('dustin artikelnummer') ||
                    label.includes('produktnummer') ||
                    label.includes('artikel-id') ||
                    label.includes('sku')
                )) {
                    const sku =
                        cleanSku(value) ||
                        cleanSku(textOf(el.parentElement)) ||
                        cleanSku(textOf(el));
                    if (sku) results.sku = sku;
                }
            }

            const bodyText = document.body ? document.body.innerText : '';

            if (!results.ean) {
                const patterns = [
                    /ean[\s:]+(\d{13,14})/i,
                    /gtin(?:-13)?[\s:]+(\d{13,14})/i,
                    /streckkod[\s:]+(\d{13,14})/i
                ];

                for (const pattern of patterns) {
                    const match = bodyText.match(pattern);
                    const e = cleanEan(match?.[1]);
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

            const bodyLower = bodyText.toLowerCase();
            const isExclVat =
                bodyLower.includes('exkl. moms') ||
                bodyLower.includes('exkl moms') ||
                bodyLower.includes('exkl. vat') ||
                bodyLower.includes('exclusive of vat') ||
                bodyLower.includes('exklusive moms');

            if (isExclVat && results.price > 0) {
                results.taxStatus = 'excl';
                results.price = results.price * 1.25;
            } else {
                results.taxStatus = 'incl';
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