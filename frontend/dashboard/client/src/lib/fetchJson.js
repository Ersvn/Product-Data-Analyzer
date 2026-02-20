const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function buildBasicAuthHeader() {
    const user = import.meta.env.VITE_DASH_USER;
    const pass = import.meta.env.VITE_DASH_PASS;
    if (!user || !pass) return null;
    return "Basic " + btoa(`${user}:${pass}`);
}

export async function fetchJson(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    const auth = buildBasicAuthHeader();
    if (auth) headers.Authorization = auth;

    const r = await fetch(`${API}${path}`, { ...init, headers });

    if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${text || r.statusText}`);
    }

    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return r.json();
    const text = await r.text();
    try { return JSON.parse(text); } catch { return text; }
}
