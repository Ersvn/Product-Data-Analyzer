const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { Pool } = require('pg');

const CONFIG = {
    CONCURRENT_WORKERS: 2,
    PRODUCTS_PER_WORKER: 8,
    MAX_RETRIES: 3,

    CACHE_HOURS: 24,
    INCOMPLETE_CACHE_HOURS: 2,

    REQUEST_DELAY_MS: { min: 2500, max: 5000 },
    PAGE_TIMEOUT: 90000,
    NAVIGATION_TIMEOUT: 60000,
    HARD_TIMEOUT: 45000,

    EAN_REQUIRED_FOR_NEW: true,
    MIN_IDENTIFIERS: 2,

    MAX_CATEGORY_PAGES: 30,
    EMPTY_PAGES_BEFORE_STOP: 3,
};

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'price_engine',
    password: process.env.DB_PASSWORD || 'admin123',
    port: process.env.DB_PORT || 5432,
    max: 10,
    idleTimeoutMillis: 30000
});

function getSiteKey(url) {
    const u = String(url).toLowerCase();
    if (u.includes('dustin')) return 'dustin';
    if (u.includes('webhallen')) return 'webhallen';
    return 'komplett';
}

function nowTime() {
    return new Date().toLocaleTimeString('sv-SE');
}

function printPhase(title) {
    console.log('\n' + '-'.repeat(72));
    console.log(`🔹 ${title}`);
    console.log('-'.repeat(72));
}

function formatDuration(ms) {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min > 0) return `${min}m ${rem}s`;
    return `${rem}s`;
}

async function getTargets() {
    const filePath = path.join(__dirname, 'targets.txt');
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);

    const targets = [];

    for (const original of lines) {
        const line = original.trim();
        if (!line || line.startsWith('#')) continue;
        if (!/^https?:\/\//i.test(line)) {
            console.log(`⚠️ Ignorerar ogiltig rad: ${line}`);
            continue;
        }
        targets.push(line);
    }

    return targets;
}

async function safeGoto(page, url, label) {
    console.log(`  ➡️ ${label}: laddar ${url}`);

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.NAVIGATION_TIMEOUT
        });
        console.log(`  ✅ ${label}: DOM loaded`);
        return 'domcontentloaded';
    } catch (err) {
        console.log(`  ⚠️ ${label}: domcontentloaded fail → försöker networkidle`);
    }

    try {
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: CONFIG.HARD_TIMEOUT
        });
        console.log(`  ✅ ${label}: networkidle success`);
        return 'networkidle';
    } catch (err) {
        console.log(`  ❌ ${label}: alla navigationer misslyckades`);
        throw err;
    }
}

async function crawlCategories(targets) {
    printPhase('FAS 1: CRAWLAR KATEGORIER');

    const { getBrowserContext, closeBrowser } = require('./lib/browser');
    const { browser, context } = await getBrowserContext('crawler');
    const page = await context.newPage();

    const allLinks = new Set();
    const siteCounts = { komplett: new Set(), dustin: new Set(), webhallen: new Set() };

    let currentTarget = null;
    let currentPageNum = 0;

    const heartbeat = setInterval(() => {
        console.log(
            `⏳ [${nowTime()}] Crawl heartbeat | site=${currentTarget || '-'} | page=${currentPageNum || '-'} | discovered=${allLinks.size}`
        );
    }, 10000);

    try {
        for (const baseTarget of targets) {
            const siteType = getSiteKey(baseTarget);
            currentTarget = siteType;

            console.log(`\n📂 Startar crawl för ${siteType.toUpperCase()}`);
            console.log(`   Target: ${baseTarget}`);

            let pageNum = 1;
            let hasMore = true;
            let emptyPages = 0;

            while (hasMore && pageNum <= CONFIG.MAX_CATEGORY_PAGES && emptyPages < CONFIG.EMPTY_PAGES_BEFORE_STOP) {
                currentPageNum = pageNum;

                const url = new URL(baseTarget);
                url.searchParams.set('page', pageNum);

                try {
                    console.log(`\n📄 ${siteType} sida ${pageNum}/${CONFIG.MAX_CATEGORY_PAGES}`);
                    await safeGoto(page, url.toString(), `${siteType} sida ${pageNum}`);

                    await page.evaluate(() => {
                        const selectors = [
                            '#cookie-consent-accept-all',
                            '#qc-cmp2-ui button[mode="primary"]',
                            '#accept-choices',
                            'button[data-testid="consent.popup.button.accept.all"]',
                            'button'
                        ];

                        for (const sel of selectors) {
                            const nodes = Array.from(document.querySelectorAll(sel));
                            for (const btn of nodes) {
                                const text = (btn.innerText || btn.textContent || '').toLowerCase();
                                if (
                                    text.includes('acceptera') ||
                                    text.includes('godkänn') ||
                                    text.includes('accept') ||
                                    text.includes('allow all')
                                ) {
                                    btn.click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    }).catch(() => {});

                    console.log(`  🔍 Skannar sidan efter produktlänkar...`);

                    await page.mouse.wheel(0, 2000);
                    await page.waitForTimeout(1000);

                    const links = await page.evaluate((site) => {
                        const patterns = {
                            komplett: /\/product\/\d+\/[a-z0-9-]+/gi,
                            dustin: /\/product\/5\d+\/[a-z0-9-]+/gi,
                            webhallen: /\/product\/\d+-[a-z0-9-]+/gi
                        };

                        const regex = patterns[site] || patterns.komplett;
                        const matches = document.documentElement.innerHTML.match(regex) || [];

                        const baseUrls = {
                            komplett: 'https://www.komplett.se',
                            dustin: 'https://www.dustinhome.se',
                            webhallen: 'https://www.webhallen.com'
                        };

                        return matches.map((m) => {
                            const clean = m.split('?')[0];
                            return (clean.startsWith('http') ? clean : baseUrls[site] + clean).toLowerCase();
                        });
                    }, siteType);

                    const beforeGlobal = allLinks.size;
                    const beforeSite = siteCounts[siteType].size;

                    links.forEach((l) => {
                        allLinks.add(l);
                        siteCounts[siteType].add(l);
                    });

                    const newGlobal = allLinks.size - beforeGlobal;
                    const newSite = siteCounts[siteType].size - beforeSite;

                    console.log(`  ✅ Hittade ${links.length} länkträffar på sidan`);
                    console.log(`  ➕ Nya för ${siteType}: ${newSite}`);
                    console.log(`  📦 Totalt ${siteType}: ${siteCounts[siteType].size}`);
                    console.log(`  🌍 Totalt alla sites: ${allLinks.size}`);

                    if (newGlobal === 0) {
                        emptyPages++;
                        console.log(`  ⚠️ Inga nya länkar på denna sida (tom-räknare: ${emptyPages}/${CONFIG.EMPTY_PAGES_BEFORE_STOP})`);

                        if (emptyPages >= CONFIG.EMPTY_PAGES_BEFORE_STOP) {
                            console.log(`  ⛔ ${siteType}: ${CONFIG.EMPTY_PAGES_BEFORE_STOP} tomma sidor i rad → stoppar`);
                            hasMore = false;
                        } else {
                            pageNum++;
                        }
                    } else {
                        emptyPages = 0;
                        pageNum++;
                    }

                    await page.waitForTimeout(800 + Math.random() * 700);
                } catch (err) {
                    console.log(`  ❌ ${siteType} sida ${pageNum} fel: ${err.message}`);
                    hasMore = false;
                }
            }

            console.log(`\n✅ Klar med ${siteType.toUpperCase()} | hittade ${siteCounts[siteType].size} unika produktlänkar`);
        }
    } finally {
        clearInterval(heartbeat);
        await closeBrowser(browser, context, 'crawler');
    }

    console.log('\n📊 Crawl-sammanfattning:');
    console.log(`   Komplett:  ${siteCounts.komplett.size}`);
    console.log(`   Dustin:    ${siteCounts.dustin.size}`);
    console.log(`   Webhallen: ${siteCounts.webhallen.size}`);
    console.log(`   Totalt:    ${allLinks.size}\n`);

    return {
        allLinks: Array.from(allLinks),
        siteCounts: {
            komplett: siteCounts.komplett.size,
            dustin: siteCounts.dustin.size,
            webhallen: siteCounts.webhallen.size
        }
    };
}

async function filterFreshProducts(urls) {
    printPhase('FAS 2: FILTERAR CACHE / VÄLJER VAD SOM SKA SCRAPAS');

    const toScrape = [];
    const skipped = [];

    const siteStats = {
        komplett: { total: 0, skipped: 0, scrape: 0, incompleteRescrape: 0 },
        dustin: { total: 0, skipped: 0, scrape: 0, incompleteRescrape: 0 },
        webhallen: { total: 0, skipped: 0, scrape: 0, incompleteRescrape: 0 }
    };

    urls.forEach((url) => {
        const site = getSiteKey(url);
        siteStats[site].total++;
    });

    console.log(`📦 Totalt upptäckta URLs att kontrollera: ${urls.length}`);

    const batchSize = 50;

    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);

        const promises = batch.map(async (url) => {
            const site = getSiteKey(url);

            try {
                const existing = await pool.query(
                    `
                        select
                            last_scraped,
                            ean,
                            mpn,
                            sku,
                            id
                        from scraped_products
                        where lower(url) = lower($1)
                        limit 1
                    `,
                    [url]
                );

                if (existing.rows.length === 0) {
                    toScrape.push(url);
                    siteStats[site].scrape++;
                    return;
                }

                const row = existing.rows[0];
                const hasEan = !!row.ean;
                const hasMpnOrSku = !!row.mpn || !!row.sku;
                const isCompleteEnough = hasEan || hasMpnOrSku;

                const cacheHours = isCompleteEnough
                    ? CONFIG.CACHE_HOURS
                    : CONFIG.INCOMPLETE_CACHE_HOURS;

                const freshCheck = await pool.query(
                    `
                    select 1
                    from scraped_products
                    where lower(url) = lower($1)
                      and last_scraped > now() - ($2 || ' hours')::interval
                    limit 1
                    `,
                    [url, String(cacheHours)]
                );

                if (freshCheck.rows.length > 0) {
                    skipped.push(url);
                    siteStats[site].skipped++;
                } else {
                    toScrape.push(url);
                    siteStats[site].scrape++;
                    if (!isCompleteEnough) {
                        siteStats[site].incompleteRescrape++;
                    }
                }
            } catch {
                toScrape.push(url);
                siteStats[site].scrape++;
            }
        });

        await Promise.all(promises);

        console.log(
            `  🔎 Cache-kontroll: ${Math.min(i + batchSize, urls.length)}/${urls.length} | att scrapa hittills: ${toScrape.length}`
        );
    }

    console.log('\n📊 Efter cache-filter:');
    for (const site of ['komplett', 'dustin', 'webhallen']) {
        console.log(
            `   ${site.padEnd(10)} total=${siteStats[site].total} | skippade=${siteStats[site].skipped} | att-scrapa=${siteStats[site].scrape} | recheck-ofullständig=${siteStats[site].incompleteRescrape}`
        );
    }

    console.log(`\n⏩ Skippade totalt: ${skipped.length}`);
    console.log(`🎯 Att scrapa totalt: ${toScrape.length}`);

    if (toScrape.length > 0) {
        console.log('\n📌 Första URLs som kommer scrapas:');
        toScrape.slice(0, 8).forEach((url, i) => {
            console.log(`   ${i + 1}. [${getSiteKey(url)}] ${url}`);
        });
    }

    return { toScrape, skipped, siteStats };
}

function buildMixedBatches(urls) {
    const bySite = { komplett: [], dustin: [], webhallen: [] };

    urls.forEach((url) => {
        const site = getSiteKey(url);
        bySite[site].push(url);
    });

    Object.keys(bySite).forEach((site) => {
        bySite[site] = bySite[site].sort(() => Math.random() - 0.5);
    });

    const batches = [];
    let currentBatch = [];
    let batchIndex = 0;
    const totalBatches = Math.ceil(urls.length / CONFIG.PRODUCTS_PER_WORKER);

    while (Object.values(bySite).some((arr) => arr.length > 0)) {
        for (const site of ['komplett', 'dustin', 'webhallen']) {
            if (bySite[site].length > 0 && currentBatch.length < CONFIG.PRODUCTS_PER_WORKER) {
                currentBatch.push(bySite[site].pop());
            }
        }

        if (
            currentBatch.length >= CONFIG.PRODUCTS_PER_WORKER ||
            Object.values(bySite).every((arr) => arr.length === 0)
        ) {
            if (currentBatch.length > 0) {
                batches.push({
                    urls: currentBatch,
                    batchIndex: ++batchIndex,
                    totalBatches
                });
                currentBatch = [];
            }
        }
    }

    return batches;
}

async function runWorkersParallel(urls) {
    printPhase('FAS 3: STARTAR WORKERS / BÖRJAR SCRAPEA PRODUKTER');

    const batches = buildMixedBatches(urls);
    console.log(`📦 ${batches.length} batchar skapade`);
    console.log(`👷 Max samtidiga workers: ${CONFIG.CONCURRENT_WORKERS}`);
    console.log(`📐 Produkter per worker-batch: ${CONFIG.PRODUCTS_PER_WORKER}`);

    batches.slice(0, 6).forEach((batch) => {
        const sites = batch.urls.reduce((acc, url) => {
            const s = getSiteKey(url);
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        }, {});
        console.log(
            `   Batch ${batch.batchIndex}/${batch.totalBatches} | size=${batch.urls.length} | sites=${JSON.stringify(sites)}`
        );
    });

    const results = {
        created: 0,
        updated: 0,
        failed: 0,
        suspectedChanges: 0,
        eanMissingCount: 0,
        batchIds: []
    };

    let batchCursor = 0;
    const workerPromises = [];
    const workerState = new Map();

    const heartbeat = setInterval(() => {
        const summary = Array.from(workerState.entries())
            .map(([workerId, state]) => `W${workerId}:${state}`)
            .join(' | ');

        console.log(
            `⏳ [${nowTime()}] Worker heartbeat | batchCursor=${batchCursor}/${batches.length} | ${summary || 'inga workers aktiva ännu'}`
        );
    }, 8000);

    async function runWorkerInstance(workerId) {
        while (batchCursor < batches.length) {
            const currentBatchIndex = batchCursor++;
            const batch = batches[currentBatchIndex];

            workerState.set(workerId, `tar batch ${currentBatchIndex + 1}/${batches.length}`);
            console.log(`👷 Worker ${workerId} tar batch ${currentBatchIndex + 1}/${batches.length}`);

            try {
                const workerResult = await runSingleWorker(batch, workerId);
                results.created += workerResult.created;
                results.updated += workerResult.updated;
                results.failed += workerResult.failed;
                results.suspectedChanges += workerResult.suspectedChanges;
                results.eanMissingCount += workerResult.eanMissingCount || 0;
                if (workerResult.batchId) results.batchIds.push(workerResult.batchId);
            } catch (err) {
                console.error(`❌ Worker ${workerId} fel i batch ${currentBatchIndex + 1}: ${err.message}`);
                results.failed += batch.urls.length;
            }
        }

        workerState.set(workerId, 'klar');
        console.log(`👷 Worker ${workerId} klar`);
    }

    function runSingleWorker(batchMeta, workerId) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'worker-v2.js'));

            const result = {
                created: 0,
                updated: 0,
                failed: 0,
                suspectedChanges: 0,
                eanMissingCount: 0,
                batchId: null
            };

            worker.on('message', (msg) => {
                if (msg.type === 'workerStart') {
                    workerState.set(workerId, `startat batch ${batchMeta.batchIndex}/${batchMeta.totalBatches}`);
                    console.log(`🚀 Worker ${msg.workerId} startar | batch=${batchMeta.batchIndex}/${batchMeta.totalBatches} | urls=${batchMeta.urls.length}`);
                    console.log(`   🔹 Första URL i batch: ${batchMeta.urls[0]}`);
                } else if (msg.type === 'progress') {
                    workerState.set(workerId, `${msg.status} ${msg.siteCurrent || '-'}/${msg.siteTotal || '-'} ${msg.siteKey}`);
                    console.log(`[W${msg.workerId}] [${msg.siteKey}] ${msg.status} ${msg.label}`);
                } else if (msg.type === 'result') {
                    result.created += msg.created || 0;
                    result.updated += msg.updated || 0;
                    result.failed += msg.failed || 0;
                    result.suspectedChanges += msg.suspectedChanges || 0;
                    result.eanMissingCount += msg.eanMissingCount || 0;
                } else if (msg.type === 'batchComplete') {
                    result.batchId = msg.batchId;
                    workerState.set(workerId, `klar batch ${msg.batchIndex}/${msg.totalBatches}`);
                    console.log(
                        `✅ Worker ${msg.workerId} klar med batch ${msg.batchIndex}/${msg.totalBatches} | created=${msg.created} updated=${msg.updated} failed=${msg.failed} EAN-miss=${msg.eanMissingCount}`
                    );
                } else if (msg.type === 'error') {
                    workerState.set(workerId, `fel: ${msg.error}`);
                    console.log(`⚠️ Worker ${msg.workerId} fel: ${msg.error}`);
                }
            });

            worker.on('error', reject);

            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stoppad med kod ${code}`));
                } else {
                    resolve(result);
                }
            });

            worker.postMessage({
                batch: {
                    urls: batchMeta.urls,
                    batchIndex: batchMeta.batchIndex,
                    totalBatches: batchMeta.totalBatches
                },
                config: CONFIG,
                workerId
            });
        });
    }

    try {
        for (let i = 1; i <= CONFIG.CONCURRENT_WORKERS; i++) {
            workerPromises.push(runWorkerInstance(i));
        }

        await Promise.all(workerPromises);
        return results;
    } finally {
        clearInterval(heartbeat);
    }
}

async function getDatabaseStats() {
    try {
        const totalScraped = await pool.query('select count(*) as count from scraped_products');
        const pricedScraped = await pool.query('select count(*) as count from scraped_products where price is not null and price > 0');
        const withEan = await pool.query(`
            select
                count(*) as total,
                count(ean) as with_ean,
                round(count(ean) * 100.0 / nullif(count(*), 0), 1) as ean_pct
            from scraped_products
        `);

        return {
            totalScraped: parseInt(totalScraped.rows[0].count, 10),
            pricedScraped: parseInt(pricedScraped.rows[0].count, 10),
            eanCoverage: withEan.rows[0]
        };
    } catch {
        return { totalScraped: 0, pricedScraped: 0, eanCoverage: null };
    }
}

async function runBatch() {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(72));
    console.log('🕷️  PRICE SPIDER v3.3 - SIMPLIFIED SCRAPED MARKET MODE');
    console.log('='.repeat(72));

    try {
        const dbStats = await getDatabaseStats();
        console.log(`\n📊 Databas-status:`);
        console.log(`   Scraped rows: ${dbStats.totalScraped} | Med pris: ${dbStats.pricedScraped}`);
        if (dbStats.eanCoverage) {
            console.log(`   EAN-täckning: ${dbStats.eanCoverage.with_ean}/${dbStats.eanCoverage.total} (${dbStats.eanCoverage.ean_pct}%)`);
        }

        const targets = await getTargets();
        if (targets.length === 0) {
            console.log('❌ Inga targets hittade');
            return;
        }

        console.log(`\n📌 Targets (${targets.length}):`);
        targets.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));

        console.log('\n🚦 Pipeline startar nu...');
        console.log('   1) Crawl kategori-sidor');
        console.log('   2) Filtrera cache i scraped_products');
        console.log('   3) Starta workers och scrape:a produktsidor');

        const crawlStarted = Date.now();
        const crawlResult = await crawlCategories(targets);
        console.log(`⏱️ Crawl färdig på ${formatDuration(Date.now() - crawlStarted)}`);

        const filterStarted = Date.now();
        const filterResult = await filterFreshProducts(crawlResult.allLinks);
        console.log(`⏱️ Cache-filter färdigt på ${formatDuration(Date.now() - filterStarted)}`);

        const toScrape = filterResult.toScrape;

        if (toScrape.length === 0) {
            console.log('\n✅ Alla produkter är färska. Inget att scrape:a.');
            return;
        }

        console.log(`\n🚀 Nu börjar faktisk scraping av ${toScrape.length} produkt-URLs...`);

        const scrapeStarted = Date.now();
        const results = await runWorkersParallel(toScrape);
        console.log(`⏱️ Scrape-fasen tog ${formatDuration(Date.now() - scrapeStarted)}`);

        const durationSeconds = (Date.now() - startTime) / 1000;
        const duration = durationSeconds.toFixed(1);
        const processed = results.created + results.updated;
        const rate = processed > 0 ? (processed / (durationSeconds / 60)).toFixed(1) : '0.0';
        const eanQuality = processed > 0
            ? (((processed - results.eanMissingCount) / processed) * 100).toFixed(1)
            : '0.0';

        console.log('\n' + '='.repeat(72));
        console.log('✨ SKRAPNING SLUTFÖRD');
        console.log('='.repeat(72));
        console.log(`📦 URLs upptäckta:        ${crawlResult.allLinks.length}`);
        console.log(`⏩ Skippade (cache):      ${filterResult.skipped.length}`);
        console.log(`🎯 Faktiskt scrapade:     ${toScrape.length}`);
        console.log(`🆕 Skapade:               ${results.created}`);
        console.log(`🔄 Uppdaterade:           ${results.updated}`);
        console.log(`❌ Misslyckade:           ${results.failed}`);
        console.log(`🏷️ Saknar EAN:            ${results.eanMissingCount}`);
        console.log(`✅ EAN-kvalitet:          ${eanQuality}%`);
        console.log(`⚡ Hastighet:             ${rate} produkter/min`);
        console.log(`⏱️ Total tid:             ${duration}s`);

        if (results.batchIds.length) {
            console.log(`🧾 Batch IDs:             ${results.batchIds.filter(Boolean).join(', ')}`);
        }

        console.log('\n📊 Per site efter crawl:');
        console.log(`   Komplett:  ${crawlResult.siteCounts.komplett}`);
        console.log(`   Dustin:    ${crawlResult.siteCounts.dustin}`);
        console.log(`   Webhallen: ${crawlResult.siteCounts.webhallen}`);
    } catch (err) {
        console.error('\n❌ Batch-körning misslyckades:', err);
    } finally {
        await pool.end().catch(() => {});
    }
}

runBatch();