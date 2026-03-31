const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 85000;

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

        const auth = buildBasicAuthHeader();
        if (auth) headers.Authorization = auth;

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
            const text = payload.trim();
            if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
                try {
                    return JSON.parse(text);
                } catch {
                    // ignore
                }
            }
        }

        return payload;
    }

    fetchCompare({ q = "" } = {}) {
        return this.request(`/api/compare${toQuery({ q })}`);
    }

    fetchDbCompanyListings({ q = "", afterId = 0, limit = 200 } = {}) {
        return this.request(`/api/db/company-listings${toQuery({ q, afterId, limit })}`);
    }

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

    applyDbAutoPrice(companyId) {
        return this.request(
            `/api/db/company-listings/${encodeURIComponent(String(companyId))}/apply-auto`,
            { method: "POST" }
        );
    }


    fetchDbScrapedMarket({ q = "", afterUid = "", limit = 200 } = {}) {
        return this.request(`/api/db/scraped-market${toQuery({ q, afterUid, limit })}`);
    }

    fetchDbScrapedProductView(uid) {
        return this.request(`/api/db/scraped-product-view${toQuery({ uid })}`);
    }

    fetchScraperStatus() {
        return this.request(`/api/scraper/status`);
    }

    fetchScraperLogs({ limit = 200 } = {}) {
        return this.request(`/api/scraper/logs${toQuery({ limit })}`);
    }

    fetchScraperRuns({ limit = 20 } = {}) {
        return this.request(`/api/scraper/runs${toQuery({ limit })}`);
    }

    startScraper() {
        return this.request(`/api/scraper/start`, {
            method: "POST",
            timeoutMs: 120000,
        });
    }

    stopScraper() {
        return this.request(`/api/scraper/stop`, {
            method: "POST",
        });
    }
}

export const api = new ApiClient();
export { API_BASE };