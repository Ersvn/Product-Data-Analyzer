// src/lib/api.js
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

        // Body handling
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
            if (
                (t2.startsWith("{") && t2.endsWith("}")) ||
                (t2.startsWith("[") && t2.endsWith("]"))
            ) {
                try {
                    return JSON.parse(t2);
                } catch {
                    /* ignore */
                }
            }
        }

        return payload;
    }

    /* =========================
       PRODUCTS (market)
    ========================= */
    fetchProducts({ q = "", page = 1, limit = 200, sort = "" } = {}) {
        return this.request(`/api/products${toQuery({ q, page, limit, sort })}`);
    }

    /* =========================
       PRODUCTS (company)
    ========================= */
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

    /* =========================
       COMPARE
    ========================= */
    fetchCompare({ q = "" } = {}) {
        return this.request(`/api/compare${toQuery({ q })}`);
    }

    /* =========================
       HISTORY
    ========================= */
    fetchHistory(ean, { days = 90, limit = 500 } = {}) {
        return this.request(
            `/api/history/compare/${encodeURIComponent(String(ean))}${toQuery({ days, limit })}`
        );
    }

    /* =========================
       PRICING (company) — by EAN
    ========================= */

    // productKey = EAN (string)
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

    /* =========================
       BULK PRICING
    ========================= */
    recomputeAllPricing({ persist = true } = {}) {
        return this.request(
            `/api/company/products/pricing/recompute-all${toQuery({ persist })}`,
            { method: "POST" }
        );
    }
}

export const api = new ApiClient();
export { API_BASE };