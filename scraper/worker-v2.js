const { parentPort } = require('worker_threads');
const { getBrowserContext, closeBrowser } = require('./lib/browser');
const komplett = require('./sites/komplett');
const dustin = require('./sites/dustin');
const webhallen = require('./sites/webhallen');
const { upsertScrapedProduct, generateBatchId, extractBrandFromName } = require('./lib/db-v2');

function getSiteKey(url) {
    const u = String(url).toLowerCase();
    if (u.includes('dustin')) return 'dustin';
    if (u.includes('webhallen')) return 'webhallen';
    return 'komplett';
}

function getExtractor(siteKey) {
    if (siteKey === 'dustin') return dustin;
    if (siteKey === 'webhallen') return webhallen;
    return komplett;
}

function shortText(text, max = 45) {
    if (!text) return '';
    return text.length <= max ? text : `${text.substring(0, max)}...`;
}

function summarizeIdentifiers(data) {
    return {
        hasEan: !!data?.ean,
        hasMpn: !!data?.mpn,
        hasSku: !!data?.sku,
        missing: [
            !data?.ean ? 'EAN' : null,
            !data?.mpn ? 'MPN' : null,
            !data?.sku ? 'SKU' : null
        ].filter(Boolean)
    };
}

function guessIdentifierSource(data) {
    if (data?.ean) return 'EAN';
    if (data?.mpn) return 'MPN';
    if (data?.sku) return 'SKU';
    return 'NONE';
}

function getSiteTuning(siteKey) {
    if (siteKey === 'dustin') {
        return {
            priceTimeout: 10000,
            pass1: { doScroll: true, doExpand: false, settleDelay: 700, identifierWait: 2200 },
            pass2: { doScroll: true, doExpand: true, settleDelay: 1800, identifierWait: 5500 },
            pass3: { doScroll: true, doExpand: true, settleDelay: 2800, identifierWait: 8500 },
            requireExtraRetryIfNoEan: true
        };
    }

    if (siteKey === 'webhallen') {
        return {
            priceTimeout: 10000,
            pass1: { doScroll: true, doExpand: false, settleDelay: 600, identifierWait: 2000 },
            pass2: { doScroll: true, doExpand: true, settleDelay: 1700, identifierWait: 5000 },
            pass3: { doScroll: true, doExpand: true, settleDelay: 2600, identifierWait: 8000 },
            requireExtraRetryIfNoEan: true
        };
    }

    return {
        priceTimeout: 8000,
        pass1: { doScroll: true, doExpand: false, settleDelay: 300, identifierWait: 1200 },
        pass2: { doScroll: true, doExpand: true, settleDelay: 800, identifierWait: 3000 },
        pass3: { doScroll: true, doExpand: true, settleDelay: 1200, identifierWait: 4500 },
        requireExtraRetryIfNoEan: false
    };
}

async function safeGoto(page, url, config) {
    const strategies = [
        { waitUntil: 'domcontentloaded', timeout: config.NAVIGATION_TIMEOUT },
        { waitUntil: 'networkidle', timeout: config.HARD_TIMEOUT },
        { waitUntil: 'load', timeout: config.HARD_TIMEOUT }
    ];

    for (let i = 0; i < strategies.length; i++) {
        try {
            console.log(`   🌐 Navigerar (${strategies[i].waitUntil})...`);
            await page.goto(url, strategies[i]);
            return strategies[i].waitUntil;
        } catch (err) {
            if (i === strategies.length - 1) throw err;
            console.log(`   ⚠️ ${strategies[i].waitUntil} misslyckades, försöker nästa...`);
        }
    }
}

async function waitForPriceWithFallback(page, timeout = 10000) {
    const priceSelectors = [
        '.price-value',
        '[data-test-id="product-price"]',
        '.product-price-now',
        '.price',
        '.current-price',
        '[class*="price"]'
    ];

    for (const selector of priceSelectors) {
        try {
            await page.waitForSelector(selector, { timeout: Math.max(800, timeout / priceSelectors.length) });
            const element = await page.$(selector);
            if (element) {
                const text = await element.textContent();
                if (text && text.match(/\d/)) {
                    return selector;
                }
            }
        } catch {}
    }
    return null;
}

async function waitForIdentifierSignals(page, timeout = 6000) {
    const identifierSelectors = [
        'script[type="application/ld+json"]',
        'table',
        'tr',
        '[class*="spec"]',
        '[data-ean]',
        '[data-gtin]',
        '[data-product-ean]'
    ];

    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        try {
            const found = await page.evaluate((selectors) => {
                const bodyText = (document.body?.innerText || '').toLowerCase();

                for (const sel of selectors) {
                    if (document.querySelector(sel)) {
                        return { type: 'selector', value: sel };
                    }
                }

                if (
                    bodyText.includes('ean') ||
                    bodyText.includes('gtin') ||
                    bodyText.includes('streckkod') ||
                    bodyText.includes('tillverkarens artikelnummer') ||
                    bodyText.includes('tillverkarens artikelnr') ||
                    bodyText.includes('mpn')
                ) {
                    return { type: 'body-text', value: 'identifier-keywords' };
                }

                return null;
            }, identifierSelectors);

            if (found) return found;
        } catch {}

        await page.waitForTimeout(400);
    }

    return null;
}

async function expandProductDetails(page) {
    const selectors = [
        'button:has-text("Tekniska specifikationer")',
        'a:has-text("Tekniska specifikationer")',
        'button:has-text("Teknisk specifikation")',
        'a:has-text("Teknisk specifikation")',
        'button:has-text("Specifikationer")',
        'a:has-text("Specifikationer")',
        'button:has-text("Visa mer")',
        'button:has-text("Läs mer")',
        '[data-testid*="spec"]',
        '[data-test-id*="spec"]'
    ];

    let clicks = 0;

    for (const sel of selectors) {
        try {
            const nodes = await page.$$(sel);
            for (const node of nodes.slice(0, 3)) {
                try {
                    await node.click({ timeout: 1000 });
                    clicks++;
                    await page.waitForTimeout(500);
                } catch {}
            }
        } catch {}
    }

    return clicks;
}

async function runExtractionPass(page, extractor, passNo, options = {}) {
    const {
        doScroll = true,
        doExpand = false,
        settleDelay = 500,
        identifierWait = 2500
    } = options;

    if (doScroll) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(350);
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(350);
    }

    let expandClicks = 0;
    if (doExpand) {
        expandClicks = await expandProductDetails(page);
    }

    await Promise.race([
        waitForIdentifierSignals(page, identifierWait),
        page.waitForTimeout(identifierWait)
    ]);

    if (settleDelay > 0) {
        await page.waitForTimeout(settleDelay);
    }

    const data = await extractor.extract(page);
    const idSummary = summarizeIdentifiers(data);

    return {
        passNo,
        expandClicks,
        data,
        idSummary,
        sourceGuess: guessIdentifierSource(data)
    };
}

function chooseBestExtractionResult(results) {
    if (!results || results.length === 0) return null;

    const score = (r) => {
        let s = 0;
        if (r?.data?.name) s += 2;
        if (r?.data?.price && r.data.price > 0) s += 3;
        if (r?.data?.ean) s += 10;
        if (r?.data?.mpn) s += 6;
        if (r?.data?.sku) s += 3;
        return s;
    };

    return [...results].sort((a, b) => score(b) - score(a))[0];
}

async function doDeepScroll(page) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(1000);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(900);
}

async function scrapeProduct(page, url, config, batchId) {
    const siteKey = getSiteKey(url);
    const siteName = siteKey.charAt(0).toUpperCase() + siteKey.slice(1);
    const extractor = getExtractor(siteKey);
    const tuning = getSiteTuning(siteKey);

    let retries = 0;
    const maxRetries = config.MAX_RETRIES || 3;

    while (retries < maxRetries) {
        try {
            const gotoMode = await safeGoto(page, url, config);
            const priceSelector = await waitForPriceWithFallback(page, tuning.priceTimeout);

            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(400 + Math.random() * 400);

            const passResults = [];

            const pass1 = await runExtractionPass(page, extractor, 1, tuning.pass1);
            passResults.push(pass1);

            let needMoreIdentifierWork = !pass1.data?.ean && (!pass1.data?.mpn || !pass1.data?.sku);

            if (needMoreIdentifierWork) {
                console.log(`   🔎 Identifier pass 2: öppnar specs och väntar extra...`);
                const pass2 = await runExtractionPass(page, extractor, 2, tuning.pass2);
                passResults.push(pass2);
                needMoreIdentifierWork = !pass2.data?.ean && (!pass2.data?.mpn || !pass2.data?.sku);
            }

            if (needMoreIdentifierWork) {
                console.log(`   🧠 Identifier pass 3: djup fallback...`);
                await doDeepScroll(page);
                const pass3 = await runExtractionPass(page, extractor, 3, tuning.pass3);
                passResults.push(pass3);
            }

            const best = chooseBestExtractionResult(passResults);
            const data = best?.data || {};
            const idSummary = summarizeIdentifiers(data);

            const validationErrors = [];

            if (!data.price || data.price <= 0 || data.price > 1000000) {
                validationErrors.push('Ogiltigt pris');
            }

            if (!data.name || data.name.length < 2) {
                validationErrors.push('Ogiltigt namn');
            }

            const identifierCount = [data.ean, data.mpn, data.sku].filter(Boolean).length;
            const hasIdentifier = identifierCount >= (config.MIN_IDENTIFIERS || 1);

            if (!hasIdentifier) {
                validationErrors.push('Saknar produktidentifierare (EAN/MPN/SKU)');
            }

            if (config.EAN_REQUIRED_FOR_NEW && !data.ean) {
                validationErrors.push('EAN krävs för nya produkter');
            }

            const hasNameAndPrice = !!data.name && !!data.price && data.price > 0;
            const weakEanForProblemSites = !data.ean && (siteKey === 'dustin' || siteKey === 'webhallen');

            if (
                weakEanForProblemSites &&
                hasNameAndPrice &&
                tuning.requireExtraRetryIfNoEan &&
                retries < maxRetries - 1
            ) {
                console.log(`   ♻️ ${siteKey}: namn+pris finns men ingen EAN → reload + retry`);
                await page.reload({ waitUntil: 'domcontentloaded', timeout: config.NAVIGATION_TIMEOUT }).catch(() => {});
                await page.waitForTimeout(1500 + Math.random() * 1000);
                throw new Error('Ingen EAN ännu på problem-site, forcing retry');
            }

            if (validationErrors.length > 0) {
                throw new Error(
                    `Valideringsfel: ${validationErrors.join(', ')} | ` +
                    `pass=${best?.passNo || '?'} | source=${best?.sourceGuess || 'NONE'} | ` +
                    `missing=${idSummary.missing.join('/') || 'none'}`
                );
            }

            const brand = data.brand || extractBrandFromName(data.name);

            const enrichedData = {
                url,
                siteName,
                name: data.name,
                price: data.price,
                ean: data.ean,
                mpn: data.mpn,
                sku: data.sku,
                brand,
                category: data.category || null,
                currency: 'SEK',
                inStock: data.inStock ?? true,
                batchId,
                _extractionPasses: passResults.length,
                _identifierPassUsed: best?.passNo || 1,
                _identifierSourceGuess: best?.sourceGuess || 'NONE',
                _identifierCount: identifierCount,
                _hasEan: !!data.ean,
                _hasMpn: !!data.mpn,
                _hasSku: !!data.sku,
                _missingIdentifiers: idSummary.missing,
                _gotoMode: gotoMode,
                _priceSelector: priceSelector || null,
                _passDebug: passResults.map((p) => ({
                    passNo: p.passNo,
                    expandClicks: p.expandClicks,
                    hasEan: p.idSummary.hasEan,
                    hasMpn: p.idSummary.hasMpn,
                    hasSku: p.idSummary.hasSku,
                    sourceGuess: p.sourceGuess
                }))
            };

            const result = await upsertScrapedProduct(enrichedData);

            return {
                success: true,
                action: result.action,
                warning: false,
                message: result.message || '',
                gotoMode,
                siteKey,
                passUsed: best?.passNo || 1,
                sourceGuess: best?.sourceGuess || 'NONE',
                data: {
                    name: data.name,
                    price: Math.round(data.price),
                    ean: data.ean || 'N/A',
                    mpn: data.mpn || 'N/A',
                    sku: data.sku || 'N/A',
                    brand: brand || 'N/A',
                    identifiersFound: identifierCount
                }
            };
        } catch (err) {
            retries++;
            console.log(`   🔄 Retry ${retries}/${maxRetries}: ${err.message}`);

            if (retries >= maxRetries) {
                return {
                    success: false,
                    error: err.message,
                    siteKey,
                    url: url.split('/').pop()
                };
            }

            const delay = (1200 * Math.pow(2, retries)) + (Math.random() * 1200);
            await page.waitForTimeout(delay);
        }
    }

    return { success: false, error: 'Max retries reached', siteKey };
}

async function runWorker(batchMeta, config, workerId) {
    const { urls, batchIndex, totalBatches } = batchMeta;

    const sessionId = `worker_${workerId}_batch_${batchIndex}_${Date.now()}`;
    const { browser, context } = await getBrowserContext(sessionId);
    const page = await context.newPage();
    const batchId = generateBatchId();

    let created = 0;
    let updated = 0;
    let failed = 0;
    let suspectedChanges = 0;
    let eanMissingCount = 0;

    const totalUrls = urls.length;

    parentPort.postMessage({
        type: 'workerStart',
        workerId,
        batchSize: urls.length,
        batchIndex,
        totalBatches
    });

    try {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const currentPos = i + 1;

            parentPort.postMessage({
                type: 'progress',
                workerId,
                siteKey: getSiteKey(url),
                siteCurrent: currentPos,
                siteTotal: totalUrls,
                batchCurrent: currentPos,
                batchTotal: totalUrls,
                status: '➡️ START',
                label: shortText(url.split('/').pop() || url, 50)
            });

            const result = await scrapeProduct(page, url, config, batchId);

            if (result.success) {
                if (result.data.ean === 'N/A') eanMissingCount++;

                const idTag = `P${result.passUsed}|${result.sourceGuess}|ID:${result.data.identifiersFound}`;
                const debugLabel =
                    `${result.data.price}kr | ${idTag} | ` +
                    `EAN=${result.data.ean || 'N/A'} | ` +
                    `MPN=${result.data.mpn || 'N/A'} | ` +
                    `SKU=${result.data.sku || 'N/A'} | ` +
                    `${shortText(result.data.name, 40)}`;

                if (result.action === 'created') {
                    created++;
                    parentPort.postMessage({
                        type: 'progress',
                        workerId,
                        siteKey: result.siteKey,
                        siteCurrent: currentPos,
                        siteTotal: totalUrls,
                        batchCurrent: currentPos,
                        batchTotal: totalUrls,
                        status: '🆕 CREATED',
                        label: debugLabel
                    });
                } else {
                    updated++;
                    parentPort.postMessage({
                        type: 'progress',
                        workerId,
                        siteKey: result.siteKey,
                        siteCurrent: currentPos,
                        siteTotal: totalUrls,
                        batchCurrent: currentPos,
                        batchTotal: totalUrls,
                        status: '✅ UPDATED',
                        label: debugLabel
                    });
                }
            } else {
                failed++;
                parentPort.postMessage({
                    type: 'progress',
                    workerId,
                    siteKey: result.siteKey || getSiteKey(url),
                    siteCurrent: currentPos,
                    siteTotal: totalUrls,
                    batchCurrent: currentPos,
                    batchTotal: totalUrls,
                    status: '❌ FAILED',
                    label: shortText(result.error, 70)
                });
            }

            const baseDelay = config.REQUEST_DELAY_MS.min;
            const variance = config.REQUEST_DELAY_MS.max - config.REQUEST_DELAY_MS.min;
            const delay = baseDelay + Math.random() * variance;
            const finalDelay = result.success ? delay : delay * 1.5;

            await page.waitForTimeout(finalDelay);
        }
    } finally {
        await closeBrowser(browser, context, sessionId);
    }

    parentPort.postMessage({
        type: 'result',
        created,
        updated,
        failed,
        suspectedChanges,
        eanMissingCount
    });

    parentPort.postMessage({
        type: 'batchComplete',
        workerId,
        batchIndex,
        totalBatches,
        batchId,
        created,
        updated,
        failed,
        suspectedChanges,
        eanMissingCount
    });

    return { created, updated, failed, suspectedChanges, eanMissingCount };
}

parentPort.once('message', async ({ batch, config, workerId }) => {
    try {
        await runWorker(batch, config, workerId);
    } catch (err) {
        parentPort.postMessage({
            type: 'error',
            workerId,
            error: err.message,
            stack: err.stack
        });
    }
});