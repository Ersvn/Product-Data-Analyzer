import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import basicAuth from "basic-auth";

const app = express();

// Config
const PORT = process.env.PORT || 3001;

// Files
const MARKET_DB_PATH = path.resolve("src/data/products.mock.json");
const COMPANY_DB_PATH = path.resolve("src/data/company.mock.json");

// Auth
const DASH_USER = process.env.DASH_USER || "admin";
const DASH_PASS = process.env.DASH_PASS || "change-me";

// CORS allowlist
const ALLOWED_ORIGINS = [
    "http://localhost:5173",
];

app.use(express.json());

// robots.txt
app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(
        `User-agent: *
Disallow: /api/
Disallow: /

Sitemap: http://localhost:3001/sitemap.xml
# Tillåta senare om detta blir publikt
# Allow: /
`
    );
});
// Robots / indexing
app.use((req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
});

// sitemap.xml
app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml");

    const baseUrl = process.env.BASE_URL || "http://localhost:3001";

    const urls = [
        "/",              // framtida startsida
        // "/about",       // exempel
        // "/products",    // exempel
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
        .map(
            (u) => `
  <url>
    <loc>${baseUrl}${u}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
        )
        .join("")}
</urlset>`;

    res.send(xml);
});

// Security headers
app.use(
    helmet({
        contentSecurityPolicy: false,
    })
);

// Rate limiting
app.use(
    rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
    })
);

// CORS
app.use(
    cors({
        origin: function (origin, cb) {
            if (!origin) return cb(null, true); // allow curl/health checks
            if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS"));
        },
        credentials: false,
    })
);

// Basic auth
function requireAuth(req, res, next) {
    const creds = basicAuth(req);
    if (!creds || creds.name !== DASH_USER || creds.pass !== DASH_PASS) {
        res.set("WWW-Authenticate", 'Basic realm="Dashboard"');
        return res.status(401).send("Authentication required.");
    }
    next();
}

// Data load o& indexing
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function normalizeProduct(p, idx) {
    return {
        id: p.id ?? idx + 1,
        name: p.name ?? p.title ?? "Unknown",
        brand: p.brand ?? p.manufacturer ?? "",
        category: p.category ?? "",
        price: Number(p.price?.value ?? p.price ?? 0),
        store: p.store ?? p.merchant ?? "",
        url: p.url ?? p.link ?? "",
        ean: String(p.ean ?? p.gtin ?? p.ean13 ?? ""),
    };
}

let marketProducts = [];
let companyProducts = [];
let marketByEan = new Map();
let companyByEan = new Map();
let lastLoadedAt = null;

function buildIndex(arr) {
    const m = new Map();
    for (const p of arr) {
        if (p?.ean) m.set(String(p.ean), p);
    }
    return m;
}

function loadAll() {
    const rawMarket = readJson(MARKET_DB_PATH);
    const rawCompany = readJson(COMPANY_DB_PATH);

    const marketArr = Array.isArray(rawMarket) ? rawMarket : (rawMarket.products ?? rawMarket.data ?? []);
    const companyArr = Array.isArray(rawCompany) ? rawCompany : (rawCompany.products ?? rawCompany.data ?? []);

    marketProducts = marketArr.map(normalizeProduct).filter((p) => p.ean);
    companyProducts = companyArr.map(normalizeProduct).filter((p) => p.ean);

    marketByEan = buildIndex(marketProducts);
    companyByEan = buildIndex(companyProducts);

    lastLoadedAt = new Date().toISOString();
    console.log(`[DATA] loaded market=${marketProducts.length} company=${companyProducts.length} at ${lastLoadedAt}`);
}
loadAll();

// Helpers
function queryProducts(products, query) {
    let result = [...products];

    if (query.q) {
        const s = String(query.q).toLowerCase();
        result = result.filter((p) =>
            [p.name, p.brand, p.category, p.store, p.ean]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(s))
        );
    }

    if (query.brand) result = result.filter((p) => p.brand === query.brand);
    if (query.category) result = result.filter((p) => p.category === query.category);
    if (query.store) result = result.filter((p) => p.store === query.store);
    if (query.ean) result = result.filter((p) => String(p.ean) === String(query.ean));

    if (query.minPrice != null) result = result.filter((p) => p.price >= Number(query.minPrice));
    if (query.maxPrice != null) result = result.filter((p) => p.price <= Number(query.maxPrice));

    const sort = String(query.sort || "");
    const cmp = {
        price_asc: (a, b) => a.price - b.price,
        price_desc: (a, b) => b.price - a.price,
        name_asc: (a, b) => String(a.name).localeCompare(String(b.name)),
        name_desc: (a, b) => String(b.name).localeCompare(String(a.name)),
    }[sort];
    if (cmp) result.sort(cmp);

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(500, Number(query.limit || 50)));
    const start = (page - 1) * limit;
    const data = result.slice(start, start + limit);

    return {
        meta: {
            total: result.length,
            page,
            limit,
            totalPages: Math.ceil(result.length / limit),
        },
        data,
    };
}

// Routes
app.get("/health", (req, res) =>
    res.json({ ok: true, lastLoadedAt })
);

// Reload JSON without server restart
app.post("/api/reload", requireAuth, (req, res) => {
    try {
        loadAll();
        res.json({ ok: true, lastLoadedAt, market: marketProducts.length, company: companyProducts.length });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// MARKET (mock)
app.get("/api/products", requireAuth, (req, res) => {
    res.json(queryProducts(marketProducts, req.query));
});

app.get("/api/products/:id", requireAuth, (req, res) => {
    const p = marketProducts.find((x) => String(x.id) === String(req.params.id));
    if (!p) return res.status(404).json({ error: "Product not found" });
    res.json(p);
});

// COMPANY (mock)
app.get("/api/company/products", requireAuth, (req, res) => {
    res.json(queryProducts(companyProducts, req.query));
});

// GET all
app.get("/api/all", requireAuth, (req, res) => {
    const source = String(req.query.source || "market"); // market | company
    const products = source === "company" ? companyProducts : marketProducts;
    res.json(queryProducts(products, req.query));
});
// COMPARE (ean match)
app.get("/api/compare", requireAuth, (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();

    const allEans = new Set([...marketByEan.keys(), ...companyByEan.keys()]);

    const matched = [];
    const onlyInMarket = [];
    const onlyInCompany = [];

    for (const ean of allEans) {
        const m = marketByEan.get(ean) ?? null;
        const c = companyByEan.get(ean) ?? null;

        const passesQ =
            !q ||
            [m?.name, m?.brand, m?.category, m?.store, m?.ean, c?.name, c?.brand, c?.category, c?.store, c?.ean]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));

        if (!passesQ) continue;

        if (m && c) {
            const priceDiff = Number(c.price) - Number(m.price);
            matched.push({ ean, market: m, company: c, priceDiff });
        } else if (m) {
            onlyInMarket.push(m);
        } else if (c) {
            onlyInCompany.push(c);
        }
    }

    matched.sort((a, b) => a.priceDiff - b.priceDiff);

    res.json({
        meta: {
            lastLoadedAt,
            marketTotal: marketProducts.length,
            companyTotal: companyProducts.length,
            matched: matched.length,
            onlyInMarket: onlyInMarket.length,
            onlyInCompany: onlyInCompany.length,
        },
        matched,
        onlyInMarket,
        onlyInCompany,
    });
});

app.listen(PORT, () => console.log(`Mock API running on http://localhost:${PORT}`));