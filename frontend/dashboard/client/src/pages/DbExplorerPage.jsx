import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

function money(v) {
    const n = Number(v);
    if (!isFinite(n)) return "–";
    return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(n);
}

export default function DbExplorerPage() {
    const [q, setQ] = useState("");
    const [afterId, setAfterId] = useState(0);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [rows, setRows] = useState([]);

    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailErr, setDetailErr] = useState("");
    const [detailLoading, setDetailLoading] = useState(false);

    const canNext = useMemo(() => rows.length > 0, [rows]);

    async function load() {
        setLoading(true);
        setErr("");
        try {
            const data = await api.fetchDbCompanyListings({ q, afterId, limit: 50 });
            setRows(Array.isArray(data) ? data : (data?.items ?? data ?? []));
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }

    async function loadDetail(companyId) {
        setDetailLoading(true);
        setDetailErr("");
        setDetail(null);
        try {
            const d = await api.fetchDbProductViewByCompany(companyId);
            setDetail(d);
        } catch (e) {
            setDetailErr(String(e?.message || e));
        } finally {
            setDetailLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [afterId]);

    return (
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>DB Explorer (Postgres)</h2>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Sök (namn/brand/ean)…"
                    style={{ padding: 10, borderRadius: 10, width: 360 }}
                />
                <button onClick={() => { setAfterId(0); load(); }} style={{ padding: "10px 12px", borderRadius: 10 }}>
                    Sök
                </button>

                <button
                    onClick={() => setAfterId(Math.max(0, afterId - 50))}
                    disabled={afterId <= 0}
                    style={{ padding: "10px 12px", borderRadius: 10 }}
                >
                    ◀ Prev
                </button>

                <button
                    onClick={() => {
                        const last = rows[rows.length - 1];
                        if (!last?.id) return;
                        setAfterId(last.id);
                    }}
                    disabled={!canNext}
                    style={{ padding: "10px 12px", borderRadius: 10 }}
                >
                    Next ▶
                </button>

                <div style={{ opacity: 0.7, marginLeft: "auto" }}>
                    afterId: {afterId}
                </div>
            </div>

            {err ? (
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,0,0,.12)" }}>
                    {err}
                </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                {/* Left: list */}
                <div style={{ borderRadius: 16, padding: 12, background: "rgba(255,255,255,.04)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <strong>Company listings</strong>
                        {loading ? <span style={{ opacity: 0.7 }}>Laddar…</span> : null}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {rows?.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => {
                                    setSelected(r.id);
                                    loadDetail(r.id);
                                }}
                                style={{
                                    textAlign: "left",
                                    padding: 10,
                                    borderRadius: 12,
                                    border: selected === r.id ? "1px solid rgba(255,255,255,.35)" : "1px solid rgba(255,255,255,.12)",
                                    background: "transparent",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{r.name || "—"}</div>
                                        <div style={{ opacity: 0.75, fontSize: 13 }}>
                                            {r.brand || "—"} · {r.category || "—"}
                                        </div>
                                        <div style={{ opacity: 0.75, fontSize: 13 }}>
                                            EAN: {r.ean || "—"} · MPN: {r.mpn || "—"}
                                        </div>
                                    </div>
                                    <div style={{ opacity: 0.9, fontWeight: 700 }}>
                                        {money(r.ourPrice ?? r.our_price)}
                                    </div>
                                </div>
                            </button>
                        ))}

                        {!loading && (!rows || rows.length === 0) ? (
                            <div style={{ opacity: 0.7, padding: 10 }}>Inga resultat.</div>
                        ) : null}
                    </div>
                </div>

                {/* Right: detail */}
                <div style={{ borderRadius: 16, padding: 12, background: "rgba(255,255,255,.04)" }}>
                    <strong>Selected view</strong>

                    {detailLoading ? <div style={{ opacity: 0.7, marginTop: 10 }}>Laddar view…</div> : null}
                    {detailErr ? (
                        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "rgba(255,0,0,.12)" }}>
                            {detailErr}
                        </div>
                    ) : null}

                    {!detailLoading && !detail && !detailErr ? (
                        <div style={{ opacity: 0.7, marginTop: 10 }}>Välj en rad till vänster.</div>
                    ) : null}

                    {detail ? (
                        <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", opacity: 0.9 }}>
              {JSON.stringify(detail, null, 2)}
            </pre>
                    ) : null}
                </div>
            </div>
        </div>
    );
}