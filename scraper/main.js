const fs = require('fs');
const path = require('path');
const { getBrowserContext } = require('./lib/browser');
const komplett = require('./sites/komplett');
const dustin = require('./sites/dustin');
const webhallen = require('./sites/webhallen');
const { saveScrapedData, isProductFresh } = require('./lib/db');

async function slayCookies(page, url) {
    try {
        await page.evaluate((u) => {
            const isDustin = u.includes('dustin');
            const isWebh = u.includes('webhallen');
            const isKomplett = u.includes('komplett');

            let selector = '';

            if (isDustin) {
                selector = '#cookie-consent-accept-all';
            } else if (isWebh) {
                selector = '#qc-cmp2-ui button[mode="primary"]';
            } else if (isKomplett) {
                // Kompletts vanligaste väljare för "Acceptera alla"
                selector = '#accept-choices, .cookie-consent__accept-all, button[id="accept-choices"]';
            } else {
                // Fallback för standard-knappar
                selector = 'button[data-testid="consent.popup.button.accept.all"]';
            }

            const btn = document.querySelector(selector);
            if (btn) {
                btn.click();
                console.log("🍪 Cookie monster ate the banner!");
            }

            // Webhallen-specifik extra stängning av popups
            if (isWebh) {
                const closePopup = document.querySelector('.v-icon.mdi-close, .close-button, .close-modal');
                if (closePopup) closePopup.click();
            }
        }, url);
        // Vänta lite så bannern hinner försvinna visuellt
        await page.waitForTimeout(1000);
    } catch (e) {
        // Vi loggar inte fel här för att inte skräpa ner om bannern redan är borta
    }
}

async function runBatch() {
    console.log('\n--- 🚀 STARTAR CRAWLER v8 (OPTIMIZED FOR KOMPLETT) ---');

    const targets = await (async () => {
        const filePath = path.join(__dirname, 'targets.txt');
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
    })();

    const { browser, context } = await getBrowserContext();
    const page = await context.newPage();

    let finalProductList = [];
    let skippedCount = 0;
    let newScrapedCount = 0;
    let failedCount = 0;

    // --- FAS 1: CRAWLA KATEGORIER ---
    for (const baseTarget of targets) {
        const isDustin = baseTarget.includes('dustin');
        const isWebh = baseTarget.includes('webhallen');
        const isKomplett = baseTarget.includes('komplett');

        let hasMorePages = true;
        let pageCounter = 1;

        console.log(`\n📂 Djupskrapning: ${baseTarget}`);

        while (hasMorePages && pageCounter <= 25) {
            const urlObj = new URL(baseTarget);
            urlObj.searchParams.set('page', pageCounter);
            const targetUrl = urlObj.toString();

            process.stdout.write(`  📄 Sida ${pageCounter}... `);

            let pageRetry = 0;
            let pageSuccess = false;

            while (pageRetry < 2 && !pageSuccess) {
                try {
                    // Komplett mår bättre av 'domcontentloaded' då de har tunga analytics-scripts som ofta tajmar ut
                    await page.goto(targetUrl, {
                        waitUntil: isKomplett ? 'domcontentloaded' : 'networkidle',
                        timeout: 90000 // Ökad till 90s för sega sidor
                    });

                    await slayCookies(page, targetUrl);

                    // Scrolla för att trigga rendering av produktkort
                    await page.mouse.wheel(0, 3000);
                    await page.waitForTimeout(2000);

                    const dataFromPage = await page.evaluate(({ isD, isW }) => {
                        const foundLinks = new Set();
                        let regex = /\/product\/\d+\/[a-z0-9-]+/gi;
                        if (isD) regex = /\/product\/5\d+\/[a-z0-9-]+/gi;
                        if (isW) regex = /\/product\/\d+-[a-z0-9-]+/gi;

                        const matches = document.documentElement.innerHTML.match(regex);
                        if (matches) {
                            matches.forEach(m => {
                                let baseUrl = "https://www.komplett.se";
                                if (isD) baseUrl = "https://www.dustinhome.se";
                                if (isW) baseUrl = "https://www.webhallen.com";
                                const url = (m.startsWith('http') ? m : baseUrl + m).split('?')[0];
                                foundLinks.add(url.toLowerCase());
                            });
                        }

                        let hasMore = foundLinks.size > 0;
                        if (isD) hasMore = document.body.innerText.includes('Visa fler');

                        return { links: Array.from(foundLinks), hasNext: hasMore };
                    }, { isD: isDustin, isW: isWebh });

                    if (dataFromPage.links.length > 0) {
                        dataFromPage.links.forEach(l => finalProductList.push(l));
                        console.log(`✅ (${dataFromPage.links.length} st)`);
                        pageSuccess = true;

                        if (!dataFromPage.hasNext) {
                            hasMorePages = false;
                        } else {
                            pageCounter++;
                            await page.waitForTimeout(1000); // Kort andningspaus
                        }
                    } else {
                        console.log(`⏹ Inga fler länkar.`);
                        hasMorePages = false;
                        pageSuccess = true;
                    }
                } catch (err) {
                    pageRetry++;
                    if (pageRetry === 1) {
                        process.stdout.write(`🔄 Retry... `);
                        await page.waitForTimeout(3000);
                    } else {
                        console.log(`❌ Timeout efter 2 försök.`);
                        hasMorePages = false;
                    }
                }
            }
        }
    }

    // --- FAS 2: SKRAPA PRODUKTER ---
    const queue = [...new Set(finalProductList)];
    console.log(`\n🎯 Unika produkter att analysera: ${queue.length}`);
    console.log(`⏳ Kontrollerar cache och skrapar nya... \n`);

    for (const link of queue) {
        const fresh = await isProductFresh(link, 24);
        if (fresh) {
            skippedCount++;
            process.stdout.write(`  ⏩ Skippar gamla: ${skippedCount} st...\r`);
            continue;
        }

        if (skippedCount > 0 && newScrapedCount === 0 && failedCount === 0) {
            process.stdout.write(' '.repeat(50) + '\r');
        }

        let siteKey = link.includes('dustin') ? 'Dustin' : (link.includes('webhallen') ? 'Webhallen' : 'Komplett');
        const extractor = siteKey === 'Dustin' ? dustin : (siteKey === 'Webhallen' ? webhallen : komplett);

        let retryCount = 0;
        let success = false;

        while (retryCount < 2 && !success) {
            try {
                if (retryCount > 0) process.stdout.write(`  🔄 Retry ${retryCount}... `);
                else process.stdout.write(`🔎 [${siteKey}] ${link.split('/').pop().substring(0, 25)}... `);

                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
                await page.waitForSelector('.price-value, [data-test-id="product-price"], .product-price-now', { timeout: 10000 }).catch(() => {});

                await page.mouse.wheel(0, 800);
                await page.waitForTimeout(600);

                const data = await extractor.extract(page);

                if (data && data.price > 0 && data.price < 1000000) {
                    await saveScrapedData({ ...data, url: link, site_name: siteKey });
                    console.log(`✅ ${Math.round(data.price)} kr | EAN: ${data.ean || 'N/A'} | MPN: ${data.mpn || 'N/A'}`);
                    newScrapedCount++;
                    success = true;
                } else {
                    throw new Error("Dålig data");
                }
            } catch (e) {
                retryCount++;
                if (retryCount === 2) {
                    console.log(`💥 Misslyckades.`);
                    failedCount++;
                }
                await page.waitForTimeout(2000);
            }
        }
        await page.waitForTimeout(2500 + Math.random() * 2000);
    }

    console.log('\n' + '═'.repeat(45));
    console.log(' ✨ SKRAPNING SLUTFÖRD');
    console.log('═'.repeat(45));
    console.log(` 📦 Totalt upptäckta:    ${queue.length}`);
    console.log(` ⏩ Skippade (Cache):   ${skippedCount}`);
    console.log(` ✅ Nyskrapade:          ${newScrapedCount}`);
    console.log(` ❌ Misslyckade:         ${failedCount}`);
    console.log('═'.repeat(45) + '\n');

    await browser.close();
    process.exit();
}

runBatch();