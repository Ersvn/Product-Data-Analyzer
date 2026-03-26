const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 15000;

function buildBasicAuthHeader() {
    const user = import.meta.env.VITE_DASH_USER;
    const pass = import.meta.env.VITE_DASH_PASS;
    if (!user || !pass) return null;
    return "Basic " + btoa(`${user}:${pass}`);
}

function isPlainObject(v) {
    return v != null && typeof v === "object" && !Array.isArray(v) && !(v instanceof FormData);
}

function toQuery(params = {}) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        sp.set(k, String(v));
    });
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
}

class ApiClient {
    async request(path, options = {}) {
        const headers = { ...(options.headers || {}) };

        // Auth
        const auth = buildBasicAuthHeader();
        if (auth) headers.Authorization = auth;

        // Body handle
        let body = options.body;
        if (isPlainObject(body)) {
            headers["Content-Type"] = headers["Content-Type"] || "application/json";
            body = JSON.stringify(body);
        }

        const url = `${API_BASE}${path}`;

        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        let res;
        try {
            res = await fetch(url, {
                ...options,
                headers,
                body,
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(t);
            const msg =
                err?.name === "AbortError"
                    ? `TIMEOUT after ${timeoutMs}ms`
                    : `NETWORK_ERROR: ${String(err?.message || err)}`;
            console.error("Request failed:", msg, { url });
            throw new Error(msg);
        } finally {
            clearTimeout(t);
        }

        const contentType = res.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");

        if (res.status === 204) {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return null;
        }

        let payload;
        try {
            payload = isJson ? await res.json() : await res.text();
        } catch {
            payload = "";
        }

        if (!res.ok) {
            const detail =
                typeof payload === "string"
                    ? payload
                    : payload?.message || payload?.error || JSON.stringify(payload);
            throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
        }

        if (!isJson && typeof payload === "string") {
            const t2 = payload.trim();
            if ((t2.startsWith("{") && t2.endsWith("}")) || (t2.startsWith("[") && t2.endsWith("]"))) {
                try {
                    return JSON.parse(t2);
                } catch {
                    // ignore
                }
            }
        }

        return payload;
    }

    // -------------------------
    // Products (Market) - legacy JSON/files
    // -------------------------
    fetchProducts({ q = "", page = 1, limit = 200, sort = "" } = {}) {
        return this.request(`/api/products${toQuery({ q, page, limit, sort })}`);
    }

    // -------------------------
    // Products (Company - legacy/files)
    // -------------------------
    fetchCompanyProducts({ q = "", page = 1, limit = 200, sort = "" } = {}) {
        return this.request(`/api/company/products${toQuery({ q, page, limit, sort })}`);
    }

    createCompanyProduct(product) {
        return this.request(`/api/company/products`, {
            method: "POST",
            body: product,
        });
    }

    updateCompanyProduct(productId, patch) {
        return this.request(`/api/company/products/${encodeURIComponent(String(productId))}`, {
            method: "PATCH",
            body: patch,
        });
    }

    // Compare
    fetchCompare({ q = "" } = {}) {
        return this.request(`/api/compare${toQuery({ q })}`);
    }

    // History
    fetchHistory(ean, { days = 90, limit = 500 } = {}) {
        return this.request(
            `/api/history/compare/${encodeURIComponent(String(ean))}${toQuery({ days, limit })}`
        );
    }

    // Pricing (legacy/files) productKey = EAN
    fetchPricing(productKey, { recompute = true } = {}) {
        return this.request(
            `/api/company/products/by-ean/${encodeURIComponent(String(productKey))}/pricing${toQuery({
                recompute,
            })}`
        );
    }

    updateManualPrice(productKey, manualPrice) {
        return this.request(
            `/api/company/products/by-ean/${encodeURIComponent(String(productKey))}/pricing/manual`,
            {
                method: "PUT",
                body: { manualPrice },
            }
        );
    }

    updatePricingMode(productKey, priceMode) {
        return this.request(
            `/api/company/products/by-ean/${encodeURIComponent(String(productKey))}/pricing/mode`,
            {
                method: "PUT",
                body: { priceMode },
            }
        );
    }

    recomputePricing(productKey) {
        return this.request(
            `/api/company/products/by-ean/${encodeURIComponent(String(productKey))}/pricing/recompute`,
            { method: "POST" }
        );
    }


    // -------------------------
    // DB API (Postgres)
    // -------------------------
    fetchDbCompanyListings({ q = "", afterId = 0, limit = 200 } = {}) {
        return this.request(`/api/db/company-listings${toQuery({ q, afterId, limit })}`);
    }

    fetchDbMarketList({ q = "", afterUid = "", limit = 200 } = {}) {
        return this.request(`/api/db/market-list${toQuery({ q, afterUid, limit })}`);
    }
    // Product view (old model)
    fetchDbProductViewByCompany(companyId) {
        return this.request(`/api/db/product-view/company${toQuery({ companyId })}`);
    }

    fetchDbProductViewByEan(ean) {
        return this.request(`/api/db/product-view${toQuery({ ean })}`);
    }

    patchDbCompanyListing(id, patch) {
        return this.request(`/api/db/company-listings/${encodeURIComponent(String(id))}`, {
            method: "PATCH",
            body: patch,
        });
    }

    recomputeAllDbAuto() {
        return this.request(`/api/db/company-listings/recompute-all-auto`, {
            method: "POST",
        });
    }

    // Apply AUTO price to stored our_price (backend endpoint)
    applyDbAutoPrice(companyId) {
        return this.request(
            `/api/db/company-listings/${encodeURIComponent(String(companyId))}/apply-auto`,
            { method: "POST" }
        );
    }

    seedDbCompanyListings({ minMerchants = 3 } = {}) {
        return this.request(`/api/db/seed/company-listings${toQuery({ minMerchants })}`, {
            method: "POST",
        });
    }

    addDbCompanyListingByEan(ean) {
        return this.request(`/api/db/company-listings/add${toQuery({ ean })}`, {
            method: "POST",
        });
    }

    matchDbAll({ limit = 500 } = {}) {
        return this.request(`/api/db/match/all${toQuery({ limit })}`, { method: "POST" });
    }

    // -------------------------
    // Scraped Market (DB) - NEW
    // -------------------------
    fetchDbScrapedMarket({ q = "", afterUid = "", limit = 200 } = {}) {
        return this.request(`/api/db/scraped-market${toQuery({ q, afterUid, limit })}`);
    }

    fetchDbScrapedProductView(uid) {
        return this.request(`/api/db/scraped-product-view${toQuery({ uid })}`);
    }
}

export const api = new ApiClient();
export { API_BASE };