const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 85000;

function isPlainObject(value) {
    return (
        value != null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof FormData)
    );
}

function toQuery(params = {}) {
    const sp = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        sp.set(key, String(value));
    });

    const qs = sp.toString();
    return qs ? `?${qs}` : "";
}

class ApiClient {
    async request(path, options = {}) {
        const headers = { ...(options.headers || {}) };

        let body = options.body;
        if (isPlainObject(body)) {
            headers["Content-Type"] = headers["Content-Type"] || "application/json";
            body = JSON.stringify(body);
        }

        const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response;
        try {
            response = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers,
                body,
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timer);
            const message =
                err?.name === "AbortError"
                    ? `TIMEOUT after ${timeoutMs}ms`
                    : `NETWORK_ERROR: ${String(err?.message || err)}`;
            throw new Error(message);
        } finally {
            clearTimeout(timer);
        }

        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");

        if (response.status === 204) {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return null;
        }

        let payload;
        try {
            payload = isJson ? await response.json() : await response.text();
        } catch {
            payload = "";
        }

        if (!response.ok) {
            const detail =
                typeof payload === "string"
                    ? payload
                    : payload?.message || payload?.error || JSON.stringify(payload);
            throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
        }

        if (!isJson && typeof payload === "string") {
            const text = payload.trim();
            if (
                (text.startsWith("{") && text.endsWith("}")) ||
                (text.startsWith("[") && text.endsWith("]"))
            ) {
                try {
                    return JSON.parse(text);
                } catch {
                    // ignore
                }
            }
        }

        return payload;
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
}

export const api = new ApiClient();
export { API_BASE };
