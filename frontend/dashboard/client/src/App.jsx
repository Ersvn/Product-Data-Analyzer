import { useEffect, useMemo, useState } from "react";
import AllProducts from "./AllProducts";
import PriceHistory from "./PriceHistory.jsx";
import ProductThumb from "./ProductThumb.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function buildBasicAuthHeader() {
    const user = import.meta.env.VITE_DASH_USER;
    const pass = import.meta.env.VITE_DASH_PASS;
    if (!user || !pass) return null;
    return "Basic " + btoa(`${user}:${pass}`);
}

async function fetchJson(path) {
    const headers = {};
    const auth = buildBasicAuthHeader();
    if (auth) headers.Authorization = auth;

    const r = await fetch(`${API}${path}`, { headers });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
    }
    return r.json();
}

function Money({ v }) {
    const n = Number(v || 0);
    return <span>{n.toLocaleString("sv-SE")} kr</span>;
}

function MetricCard({ title, value, subtitle }) {
    return (
        <div className="card metric">
            <div className="card-pad">
                <div className="kicker">{title}</div>
                <div className="metricValue">{value}</div>
                {subtitle ? <div className="metricSub">{subtitle}</div> : null}
            </div>
        </div>
    );
}

function StatusPill({ diffKr, diffPct }) {
    const d = Number(diffKr || 0);
    const p = Number(diffPct || 0);

    let bg = "var(--neutral)";
    let stroke = "var(--neutralStroke)";
    let label = "I linje";

    if (d > 0) {
        bg = "var(--bad)";
        stroke = "var(--badStroke)";
        label = `Dyrare: +${Math.round(d)} kr (+${p.toFixed(1)}%)`;
    } else if (d < 0) {
        bg = "var(--good)";
        stroke = "var(--goodStroke)";
        label = `Billigare: ${Math.round(d)} kr (${p.toFixed(1)}%)`;
    }

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${stroke}`,
                background: bg,
                fontSize: 13,
                color: "var(--text)",
                whiteSpace: "nowrap",
            }}
        >
      {label}
    </span>
    );
}

function Section({ title, hint, right }) {
    return (
        <div className="section">
            <div className="row" style={{ alignItems: "baseline" }}>
                <div>
                    <h2 className="sectionTitle">{title}</h2>
                    {hint ? <div className="sectionHint">{hint}</div> : null}
                </div>
                {right}
            </div>
        </div>
    );
}

function Table({ rows, onRowClick }) {
    return (
        <div className="tableWrap">
            <table className="table">
                <thead>
                <tr>
                    {["", "Produkt", "EAN", "Market", "Vårt pris", "Status"].map((h) => (
                        <th key={h} className="th">
                            {h}
                        </th>
                    ))}
                </tr>
                </thead>

                <tbody>
                {rows.map((r) => (
                    <tr
                        key={r.ean}
                        className="tr"
                        onClick={() => onRowClick?.(r)}
                        title={onRowClick ? "Klicka för att visa prishistorik" : undefined}
                        style={{ cursor: onRowClick ? "pointer" : "default" }}
                    >
                        <td className="td" style={{ width: 64 }}>
                            <ProductThumb src={r.imageUrl} alt={r.product} />
                        </td>

                        <td className="td" style={{ whiteSpace: "normal" }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{r.product}</div>
                            <div style={{ color: "var(--muted2)", fontSize: 13, marginTop: 4 }}>
                                {r.brand} · {r.category}
                            </div>
                        </td>

                        <td className="td">
                            <span style={{ color: "var(--muted)" }}>{r.ean}</span>
                        </td>

                        <td className="td">
                            <Money v={r.marketPrice} />
                        </td>

                        <td className="td">
                            <Money v={r.companyPrice} />
                        </td>

                        <td className="td">
                            <StatusPill diffKr={r.diffKr} diffPct={r.diffPct} />
                        </td>
                    </tr>
                ))}

                {rows.length === 0 && (
                    <tr>
                        <td colSpan={6} className="td" style={{ color: "var(--muted2)" }}>
                            Inga rader att visa.
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
        </div>
    );
}

function SmallList({ title, items }) {
    return (
        <div className="card" style={{ flex: "1 1 420px" }}>
            <div className="card-pad">
                <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
                {items.length === 0 ? (
                    <div style={{ color: "var(--muted2)" }}>Inga.</div>
                ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {items.slice(0, 8).map((p) => (
                            <li key={p.id} style={{ margin: "10px 0", color: "var(--text)" }}>
                                <div style={{ fontWeight: 750 }}>{p.name}</div>
                                <div style={{ color: "var(--muted2)", fontSize: 13, marginTop: 3 }}>
                                    <Money v={p.price} /> · EAN: {p.ean}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function ThemeToggle({ theme, setTheme }) {
    const isLight = theme === "light";
    return (
        <button className="btn" onClick={() => setTheme(isLight ? "dark" : "light")} title="Växla tema">
            {isLight ? "🌙 Dark" : "☀️ Light"}
        </button>
    );
}

function WorstList({ rows, onPickFocus }) {
    const [expanded, setExpanded] = useState(false);

    const showToggle = rows.length > 3;
    const visibleRows = expanded ? rows : rows.slice(0, 3);

    return (
        <div style={{ marginTop: 12 }}>
            <div
                className="tableWrap"
                style={{
                    overflowY: expanded ? "auto" : "hidden",
                    maxHeight: expanded ? 520 : "none",
                }}
            >
                <table className="table">
                    <thead>
                    <tr>
                        {["", "Produkt", "EAN", "Market", "Vårt pris", "Status"].map((h) => (
                            <th key={h} className="th" style={{ position: expanded ? "sticky" : "static", zIndex: 1 }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                    </thead>

                    <tbody>
                    {visibleRows.map((r) => (
                        <tr
                            key={r.ean}
                            className="tr"
                            onClick={() => onPickFocus?.(String(r.ean))}
                            title="Klicka för att visa prishistorik"
                            style={{ cursor: "pointer" }}
                        >
                            <td className="td" style={{ width: 64 }}>
                                <ProductThumb src={r.imageUrl} alt={r.product} />
                            </td>

                            <td className="td" style={{ whiteSpace: "normal" }}>
                                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.product}</div>
                                <div style={{ color: "var(--muted2)", fontSize: 13, marginTop: 4 }}>
                                    {r.brand} · {r.category}
                                </div>
                            </td>

                            <td className="td">
                                <span style={{ color: "var(--muted)" }}>{r.ean}</span>
                            </td>

                            <td className="td">
                                <Money v={r.marketPrice} />
                            </td>

                            <td className="td">
                                <Money v={r.companyPrice} />
                            </td>

                            <td className="td">
                                <StatusPill diffKr={r.diffKr} diffPct={r.diffPct} />
                            </td>
                        </tr>
                    ))}

                    {visibleRows.length === 0 && (
                        <tr>
                            <td colSpan={6} className="td" style={{ color: "var(--muted2)" }}>
                                Inga rader att visa.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>

            {showToggle ? (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <button className={`btn ${expanded ? "btnPrimary" : ""}`} onClick={() => setExpanded((v) => !v)} title="Visa fler eller mindre">
                        {expanded ? "Visa mindre" : `Visa fler (${rows.length})`}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export default function App() {
    const [tab, setTab] = useState("overview");
    const [data, setData] = useState(null);
    const [q, setQ] = useState("");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    const [theme, setTheme] = useState("dark");
    const [focusEan, setFocusEan] = useState(null);

    const formatPct = (v) => {
        const n = Number(v || 0);
        if (Math.abs(n) < 1) return n.toFixed(2);
        return n.toFixed(0);
    };

    const formatKr = (v) => {
        const n = Number(v || 0);
        if (Math.abs(n) < 10) return n.toFixed(2);
        return String(Math.round(n));
    };

    useEffect(() => {
        const saved = localStorage.getItem("theme");
        const initial = saved === "light" || saved === "dark" ? saved : "dark";
        setTheme(initial);
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    useEffect(() => {
        if (tab !== "overview") return;

        setLoading(true);
        fetchJson("/api/compare")
            .then((json) => {
                setData(json);
                setErr("");
            })
            .catch((e) => setErr(String(e.message || e)))
            .finally(() => setLoading(false));
    }, [tab]);

    const matchedRows = useMemo(() => {
        if (!data?.matched) return [];

        return data.matched.map((row) => {
            const marketPrice = Number(row?.market?.price ?? 0);
            const companyPrice = Number(row?.company?.price ?? 0);

            const diffKr = Number(row?.priceDiff ?? 0);
            const diffPct = marketPrice > 0 ? (diffKr / marketPrice) * 100 : 0;

            return {
                ean: String(row.ean),
                product: row?.company?.name || row?.market?.name || "-",
                brand: row?.company?.brand || row?.market?.brand || "-",
                category: row?.company?.category || row?.market?.category || "-",
                imageUrl: row?.company?.imageUrl || row?.market?.imageUrl || null,
                marketPrice,
                companyPrice,
                diffKr,
                diffPct,
            };
        });
    }, [data]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return matchedRows;
        return matchedRows.filter((r) => [r.product, r.brand, r.category, r.ean].some((v) => String(v).toLowerCase().includes(s)));
    }, [matchedRows, q]);

    const stats = useMemo(() => {
        const rows = filtered;
        const matched = rows.length;

        const moreExpensive = rows.filter((r) => Number.isFinite(r.diffKr) && r.diffKr > 0);
        const cheaper = rows.filter((r) => Number.isFinite(r.diffKr) && r.diffKr < 0);

        const expensiveShare = matched ? (moreExpensive.length / matched) * 100 : 0;

        const sumDiffKr = rows.reduce((a, r) => a + (Number.isFinite(r.diffKr) ? r.diffKr : 0), 0);
        const sumDiffPct = rows.reduce((a, r) => a + (Number.isFinite(r.diffPct) ? r.diffPct : 0), 0);

        const avgDiffKr = matched ? sumDiffKr / matched : 0;
        const avgDiffPct = matched ? sumDiffPct / matched : 0;

        const totalOverCost = moreExpensive.reduce((a, r) => a + r.diffKr, 0);

        const worstAll = [...rows].sort((a, b) => (Number.isFinite(b.diffKr) ? b.diffKr : 0) - (Number.isFinite(a.diffKr) ? a.diffKr : 0));
        const bestAll = [...rows].sort((a, b) => (Number.isFinite(a.diffKr) ? a.diffKr : 0) - (Number.isFinite(b.diffKr) ? b.diffKr : 0));

        return {
            matched,
            expensiveCount: moreExpensive.length,
            cheaperCount: cheaper.length,
            expensiveShare,
            avgDiffKr,
            avgDiffPct,
            totalOverCost,
            worstAll,
            bestAll,
        };
    }, [filtered]);

    const worstExpensive = useMemo(() => stats.worstAll.filter((r) => Number.isFinite(r.diffKr) && r.diffKr > 0), [stats]);
    const bestCheaper = useMemo(() => stats.bestAll.filter((r) => Number.isFinite(r.diffKr) && r.diffKr < 0).slice(0, 5), [stats]);

    useEffect(() => {
        if (focusEan) return;
        if (worstExpensive.length) setFocusEan(String(worstExpensive[0].ean));
        else if (bestCheaper.length) setFocusEan(String(bestCheaper[0].ean));
    }, [worstExpensive, bestCheaper, focusEan]);

    const focusRow = useMemo(() => {
        if (!focusEan) return null;
        return filtered.find((x) => String(x.ean) === String(focusEan)) || null;
    }, [filtered, focusEan]);

    return (
        <div className="container">
            <div className="topbar">
                <div className="row">
                    <div>
                        <h1 className="h1">Prisöversikt</h1>
                        <div className="subtle">Jämförelse - Placeholder & mockDB</div>
                    </div>

                    <div className="actions">
                        <ThemeToggle theme={theme} setTheme={setTheme} />

                        <button className={`btn ${tab === "overview" ? "btnPrimary" : ""}`} onClick={() => setTab("overview")}>
                            Översikt
                        </button>

                        <button className={`btn ${tab === "all" ? "btnPrimary" : ""}`} onClick={() => setTab("all")}>
                            Alla produkter
                        </button>
                    </div>
                </div>
            </div>

            {tab === "overview" && (
                <>
                    {loading ? (
                        <div className="card" style={{ marginTop: 14 }}>
                            <div className="card-pad" style={{ color: "var(--muted)" }}>
                                Laddar…
                            </div>
                        </div>
                    ) : err ? (
                        <div className="card" style={{ marginTop: 14, borderColor: "rgba(255,71,87,0.35)" }}>
                            <div className="card-pad" style={{ background: "rgba(255,71,87,0.10)", borderRadius: 18 }}>
                                <b>Fel:</b> {err}
                                <div style={{ marginTop: 8, color: "var(--muted)" }}>
                                    Om du ser 401: kontrollera <code>VITE_DASH_USER</code> och <code>VITE_DASH_PASS</code> i <code>client/.env</code>, och starta om Vite.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                                <div style={{ flex: "1 1 360px", maxWidth: 520 }}>
                                    <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök på namn, brand, kategori eller EAN…" />
                                </div>
                            </div>

                            <div className="grid-metrics">
                                <MetricCard title="Matchade produkter" value={stats.matched} subtitle="Finns i både Placeholder & Market" />
                                <MetricCard title="Vi är dyrare på" value={`${formatPct(stats.expensiveShare)}%`} subtitle={`${stats.expensiveCount} dyrare · ${stats.cheaperCount} billigare`} />
                                <MetricCard title="Snittdiff" value={`${formatKr(stats.avgDiffKr)} kr`} subtitle={`${formatPct(stats.avgDiffPct)}% i snitt (Company - Market)`} />
                                <MetricCard title="Total överkostnad" value={`${Math.round(stats.totalOverCost).toLocaleString("sv-SE")} kr`} subtitle="Summa där vi är dyrare" />
                            </div>

                            <Section title="Värst (dyrast jämfört med marknad)" hint="Klicka på en rad för prishistorik." />
                            <WorstList rows={worstExpensive} onPickFocus={setFocusEan} />

                            <Section title="Prishistorik (fokus)" hint="Välj en produkt genom att klicka i Värst eller Bäst." />
                            {focusRow ? (
                                <div style={{ marginTop: 12 }}>
                                    <PriceHistory fetchJson={fetchJson} ean={focusRow.ean} title={focusRow.product} />
                                    <div style={{ marginTop: 8, color: "var(--muted2)", fontSize: 12 }}>
                                        EAN: <span style={{ color: "var(--muted)" }}>{focusRow.ean}</span>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, color: "var(--muted)" }}>Ingen fokusprodukt vald.</div>
                            )}

                            <Section title="Bäst (billigare än marknad)" hint="Klicka för att se prishistorik på samma sätt." />
                            <Table rows={bestCheaper} onRowClick={(r) => setFocusEan(String(r.ean))} />

                            <Section title="Fattas" hint="Finns bara i en av källorna." />
                            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
                                <SmallList title="Finns hos oss men inte i marknaden" items={data?.onlyInCompany || []} />
                                <SmallList title="Finns i marknaden men inte hos oss" items={data?.onlyInMarket || []} />
                            </div>
                        </>
                    )}
                </>
            )}

            {tab === "all" && <AllProducts fetchJson={fetchJson} />}

            <div className="footerNote">Erik Svensson Examensarbete 2026.</div>
        </div>
    );
}
