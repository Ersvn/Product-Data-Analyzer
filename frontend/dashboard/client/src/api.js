const API_BASE = "http://localhost:3001";

async function getJson(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
}

export function fetchMarketProducts({ q = "", sort = "" } = {}) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sort) params.set("sort", sort);

    const qs = params.toString();
    return getJson(`/api/products${qs ? `?${qs}` : ""}`);
}

export function fetchCompanyProducts() {
    return getJson("/api/company/products");
}

export function fetchCompare() {
    return getJson("/api/compare");
}