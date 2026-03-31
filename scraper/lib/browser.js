const { Camoufox } = require('camoufox-js');

const WEBSHARE_PROXIES = [
    { server: 'http://38.225.2.165:5948', username: 'fplujxzx', password: 'gynas2vaxdnd' },
    { server: 'http://38.225.15.76:5925', username: 'fplujxzx', password: 'gynas2vaxdnd' },
    { server: 'http://64.137.14.128:5925', username: 'fplujxzx', password: 'gynas2vaxdnd' },
    { server: 'http://92.112.228.12:6093', username: 'fplujxzx', password: 'gynas2vaxdnd' },
];

const sessionMap = new Map();
let globalProxyIndex = 0;

function getNextProxy(sessionId = 'default') {
    const proxy = WEBSHARE_PROXIES[globalProxyIndex % WEBSHARE_PROXIES.length];
    globalProxyIndex++;
    sessionMap.set(sessionId, proxy.server);
    console.log(`   🔄 Proxy-rotation: ${proxy.server}`);
    return proxy;
}

async function getBrowserContext(sessionId = 'default') {
    const proxy = getNextProxy(sessionId);

    console.log(`🦊 Camoufox 0.9.3 - Session: ${sessionId}`);
    console.log(`   Proxy: ${proxy.server}`);

    try {
        const browser = await Camoufox({
            headless: true,
            proxy: {
                server: proxy.server,
                username: proxy.username,
                password: proxy.password,
            },
            geoip: false,
            humanize: true,
            os: 'windows',
            firefox_version: 'latest',
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            locale: 'sv-SE',
            timezoneId: 'Europe/Stockholm',
            geolocation: {
                latitude: 59.3293,
                longitude: 18.0686,
                accuracy: 100
            },
            permissions: ['geolocation'],
            colorScheme: 'light',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
        });

        await context.setExtraHTTPHeaders({
            'Accept-Language': 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // ✅ ENTERPRISE: Förbättrad stealth-script
        await context.addInitScript(() => {
            // Webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            delete navigator.webdriver;

            // Permissions API - mer realistisk
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = function(parameters) {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission, onchange: null });
                }
                if (parameters.name === 'clipboard-read' || parameters.name === 'clipboard-write') {
                    return Promise.resolve({ state: 'prompt', onchange: null });
                }
                return originalQuery.call(this, parameters);
            };

            // Plugins - mer realistisk uppsättning
            const createFakePlugins = () => {
                const plugins = [
                    {name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format", version: "undefined", length: 2},
                    {name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "Portable Document Format", version: "undefined", length: 2},
                    {name: "Chromium PDF Viewer", filename: "internal-pdf-viewer2", description: "Portable Document Format", version: "undefined", length: 2},
                    {name: "Microsoft Edge PDF Viewer", filename: "internal-pdf-viewer3", description: "Portable Document Format", version: "undefined", length: 2},
                    {name: "WebKit built-in PDF", filename: "internal-pdf-viewer4", description: "Portable Document Format", version: "undefined", length: 2}
                ];

                // Gör plugins array-lik
                plugins.item = function(index) { return this[index]; };
                plugins.namedItem = function(name) { return this.find(p => p.name === name); };
                plugins.refresh = function() {};
                plugins.length = 5;

                return plugins;
            };

            Object.defineProperty(navigator, 'plugins', {
                get: createFakePlugins,
                configurable: true,
                enumerable: true
            });

            // MimeTypes
            Object.defineProperty(navigator, 'mimeTypes', {
                get: () => [
                    {type: "application/pdf", suffixes: "pdf", description: "", enabledPlugin: navigator.plugins[0]},
                    {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: navigator.plugins[1]}
                ],
                configurable: true
            });

            // Languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['sv-SE', 'sv', 'en-US', 'en', 'no', 'da'],
                configurable: true
            });

            // Chrome runtime - minimal men närvarande
            window.chrome = {
                runtime: {
                    OnInstalledReason: {CHROME_UPDATE: "chrome_update", EXTENSION_UPDATE: "extension_update", INSTALL: "install", SHARED_MODULE_UPDATE: "shared_module_update", UPDATE: "update"},
                    OnRestartRequiredReason: {APP_UPDATE: "app_update", OS_UPDATE: "os_update", PERIODIC: "periodic"},
                    PlatformArch: {ARM: "arm", ARM64: "arm64", MIPS: "mips", MIPS64: "mips64", MIPS64EL: "mips64el", MIPSEL: "mipsel", X86_32: "x86-32", X86_64: "x86-64"},
                    PlatformNaclArch: {ARM: "arm", MIPS: "mips", MIPS64: "mips64", MIPS64EL: "mips64el", MIPSEL: "mipsel", MIPSEL64: "mipsel64", X86_32: "x86-32", X86_64: "x86-64", X86_64_LINUX: "x86_64-linux"},
                    PlatformOs: {ANDROID: "android", CROS: "cros", LINUX: "linux", MAC: "mac", OPENBSD: "openbsd", WIN: "win"},
                    RequestUpdateCheckStatus: {NO_UPDATE: "no_update", THROTTLED: "throttled", UPDATE_AVAILABLE: "update_available"}
                },
                app: {isInstalled: false}
            };

            // WebGL - Intel Iris Xe (vanligt i Sverige)
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) return 'Intel Inc.';
                if (parameter === 37446) return 'Intel Iris Xe Graphics';
                if (parameter === 7937) return 'Intel Iris Xe Graphics';
                if (parameter === 7936) return 'Intel Inc.';
                return getParameter(parameter);
            };

            // Navigator properties
            Object.defineProperty(navigator, 'headless', { get: () => false });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
            Object.defineProperty(navigator, 'vendor', { get: () => '' });
            Object.defineProperty(navigator, 'productSub', { get: () => '20100101' });
            Object.defineProperty(navigator, 'doNotTrack', { get: () => null });

            // Screen properties för fingerprint consistency
            Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

            // Canvas fingerprint protection - noise injection
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

            HTMLCanvasElement.prototype.toDataURL = function(type) {
                if (this.width > 16 && this.height > 16) {
                    // Lägg till nästan osynlig noise
                    const ctx = this.getContext('2d');
                    if (ctx) {
                        const imageData = ctx.getImageData(0, 0, this.width, this.height);
                        for (let i = 0; i < imageData.data.length; i += 4) {
                            if (Math.random() < 0.001) {
                                imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() > 0.5 ? 1 : -1)));
                            }
                        }
                        ctx.putImageData(imageData, 0, 0);
                    }
                }
                return originalToDataURL.apply(this, arguments);
            };
        });

        return { browser, context, sessionId, proxy: proxy.server };
    } catch (error) {
        console.error('❌ Camoufox fel:', error.message);

        if (error.message.includes('proxy') || error.message.includes('tunnel') ||
            error.message.includes('ECONNREFUSED') || error.message.includes('NS_ERROR')) {
            console.log('🔄 Roterar till nästa proxy...');
            return getBrowserContext(sessionId);
        }
        throw error;
    }
}

async function closeBrowser(browser, context, sessionId) {
    try {
        if (context) await context.close();
        if (browser) await browser.close();
        console.log(`✅ Browser stängd för session: ${sessionId}`);
    } catch (error) {
        console.error('⚠️ Fel vid stängning:', error.message);
    }
}

module.exports = { getBrowserContext, closeBrowser };