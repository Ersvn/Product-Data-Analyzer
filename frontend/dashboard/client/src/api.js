const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

function buildBasicAuthHeader() {
    const user = import.meta.env.VITE_DASH_USER;
    const pass = import.meta.env.VITE_DASH_PASS;
    if (!user || !pass) return null;
    return "Basic " + btoa(`${user}:${pass}`);
}

async function requestJson(path, { method = "GET", body } = {}) {
    const headers = {};
    const auth = buildBasicAuthHeader();
    if (auth) headers.Authorization = auth;

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} for ${path}${text ? `: ${text}` : ""}`);
    }

    // Endpoints might return empty body
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return res.json();
}

// Existing endpoints
export function fetchMarketProducts({ q = "", sort = "" } = {}) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sort) params.set("sort", sort);

    const qs = params.toString();
    return requestJson(`/api/products${qs ? `?${qs}` : ""}`);
}

export function fetchCompanyProducts({ q = "", sort = "" } = {}) {
    // keep signature flexible!
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    return requestJson(`/api/company/products${qs ? `?${qs}` : ""}`);
}

export function fetchCompare({ q = "" } = {}) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return requestJson(`/api/compare${qs ? `?${qs}` : ""}`);
}

// Pricing endpoints

export function fetchPricing(productId, { recompute = true } = {}) {
    const params = new URLSearchParams({ recompute: String(recompute) });
    return requestJson(`/api/company/products/${productId}/pricing?${params.toString()}`);
}

export function putManualPrice(productId, manualPrice) {
    return requestJson(`/api/company/products/${productId}/pricing/manual`, {
        method: "PUT",
        body: { manualPrice },
    });
}

export function putPricingMode(productId, priceMode) {
    return requestJson(`/api/company/products/${productId}/pricing/mode`, {
        method: "PUT",
        body: { priceMode }, // "AUTO" | "MANUAL"
    });
}

export function postRecomputePricing(productId) {
    return requestJson(`/api/company/products/${productId}/pricing/recompute`, {
        method: "POST",
    });
}
