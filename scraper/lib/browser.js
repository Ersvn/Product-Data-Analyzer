// scraper/lib/browser.js
const { Camoufox } = require('camoufox');

const PROXY_LIST = ["92.112.217.208:5980", "38.225.15.76:5925",
    "64.137.14.128:5925", "92.112.228.12:6093"];
let proxyIndex = 0;

// Lista på senaste Windows 10/11 Chrome User Agents
const windowsUserAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
];

async function getBrowserContext() {
    const currentProxy = PROXY_LIST[proxyIndex];
    proxyIndex = (proxyIndex + 1) % PROXY_LIST.length;
    const randomUA = windowsUserAgents[Math.floor(Math.random() * windowsUserAgents.length)];

    console.log(`🦊 Camoufox: Simulerar Windows Desktop via ${currentProxy}`);

    const browser = await Camoufox({
        headless: false,
        proxy: `http://fplujxzx:gynas2vaxdnd@${currentProxy}`,
        geoip: true,
        humanize: true,
        os: 'windows',
        browser: 'chrome',
        blockImages: false
    });

    const context = await browser.newContext({
        userAgent: randomUA,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        locale: 'sv-SE',
        timezoneId: 'Europe/Stockholm'
    });

    return { browser, context };
}

module.exports = { getBrowserContext };