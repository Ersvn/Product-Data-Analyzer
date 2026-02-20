import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatNumber } from "../lib/utils";
import PriceHistory from "../components/features/charts/PriceHistory";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { useDebounce } from "../hooks/useDebounce";
import ProductThumb from "../components/features/products/ProductThumb";

// Sök-ikon SVG
const SearchIcon = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

function BentoCard({ icon, label, value, change, changeType, large }) {
    return (
        <div className={`bento-card ${large ? "bento-card--large" : ""}`}>
            <div className={`bento-card__icon bento-card__icon--${changeType}`}>{icon}</div>
            <div className="bento-card__label">{label}</div>
            <div className="bento-card__value">{value}</div>
            {change && (
                <div className={`bento-card__change bento-card__change--${changeType}`}>
                    {changeType === "positive" ? "↑" : changeType === "negative" ? "↓" : "→"} {change}
                </div>
            )}
        </div>
    );
}

function StatusPill({ diffKr, diffPct }) {
    const d = Number(diffKr || 0);
    const p = Number(diffPct || 0);

    let variant = "neutral";
    let label = "I linje";

    if (d > 0) {
        variant = "danger";
        label = `+${formatMoney(diffKr).replace(" kr", "")} kr (+${p.toFixed(1)}%)`;
    } else if (d < 0) {
        variant = "success";
        label = `${formatMoney(diffKr).replace(" kr", "")} kr (${p.toFixed(1)}%)`;
    }

    return <span className={`statusPill statusPill--${variant}`}>{label}</span>;
}

/* =========================
   Dashboard UI widgets (A)
========================= */

function fmtIsoShort(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString("sv-SE");
    } catch {
        return iso;
    }
}

function QualityPill({ q }) {
    const v = String(q || "").toUpperCase();
    let cls = "neutral";
    if (v === "HIGH") cls = "success";
    else if (v === "MED") cls = "neutral";
    else if (v === "LOW") cls = "danger";
    return <span className={`statusPill statusPill--${cls}`}>Benchmark: {v || "—"}</span>;
}

function QueueTabs({ value, onChange, counts }) {
    const c = counts || {};
    const tabs = [
        { key: "OVERPRICED", label: "Overpriced", count: Number(c.OVERPRICED ?? 0) },
        { key: "UNDERPRICED", label: "Underpriced", count: Number(c.UNDERPRICED ?? 0) },
        { key: "OUTLIERS", label: "Outliers", count: Number(c.OUTLIERS ?? 0) },
    ];

    return (
        <div className="segmented" style={{ gap: 8 }}>
            {tabs.map((t) => (
                <button
                    key={t.key}
                    className={`segBtn ${value === t.key ? "segBtnActive" : ""}`}
                    onClick={() => onChange(t.key)}
                    type="button"
                    title={`Visa kö: ${t.label}`}
                >
                    {t.label} <span style={{ opacity: 0.7 }}>({formatNumber(t.count)})</span>
                </button>
            ))}
        </div>
    );
}

export default function OverviewPage() {
    const nav = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const focus = searchParams.get("focus");

    // Compare search (din befintliga)
    const [q, setQ] = useState("");
    const debouncedQ = useDebounce(q, 300);

    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    // Dashboard overview + queues (A)
    const [dash, setDash] = useState(null);
    const [dashErr, setDashErr] = useState("");
    const [dashLoading, setDashLoading] = useState(true);

    const [queueType, setQueueType] = useState(searchParams.get("queue") || "UNDERPRICED");
    const [queue, setQueue] = useState(null);
    const [queueErr, setQueueErr] = useState("");
    const [queueLoading, setQueueLoading] = useState(true);

    // Keep queue in URL (så du kan refresh:a och behålla tab)
    useEffect(() => {
        const sp = new URLSearchParams(searchParams);
        if (queueType) sp.set("queue", queueType);
        setSearchParams(sp, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueType]);

    // Fetch compare (befintligt)
    useEffect(() => {
        setLoading(true);
        api
            .fetchCompare({ q: debouncedQ })
            .then((json) => {
                setData(json);
                setErr("");
            })
            .catch((e) => setErr(String(e?.message || e)))
            .finally(() => setLoading(false));
    }, [debouncedQ]);

    // Fetch dashboard overview (A1/A3)
    const loadDashboardOverview = useCallback(async () => {
        setDashLoading(true);
        setDashErr("");
        try {
            const ov = await api.request(`/api/dashboard/overview?days=30`);
            setDash(ov);
        } catch (e) {
            setDashErr(String(e?.message || e));
        } finally {
            setDashLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboardOverview();
    }, [loadDashboardOverview]);

    // Fetch queue (A2)
    const loadQueue = useCallback(
        async (type) => {
            setQueueLoading(true);
            setQueueErr("");
            try {
                const qres = await api.request(
                    `/api/dashboard/queue?type=${encodeURIComponent(String(type))}&limit=25`
                );
                setQueue(qres);
            } catch (e) {
                setQueueErr(String(e?.message || e));
            } finally {
                setQueueLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        loadQueue(queueType);
    }, [queueType, loadQueue]);

    const rows = useMemo(() => {
        if (!data?.matched) return [];
        return data.matched.map((row) => {
            const marketPrice = Number(row?.market?.price ?? 0);
            const companyPrice = Number(row?.company?.price ?? 0);
            const diffKr = Number(row?.priceDiff ?? 0);
            const diffPct = marketPrice > 0 ? (diffKr / marketPrice) * 100 : 0;

            return {
                ean: String(row.ean),
                name: row?.company?.name || row?.market?.name || "-",
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

    const stats = useMemo(() => {
        const matched = rows.length;
        const moreExpensive = rows.filter((r) => r.diffKr > 0);
        const cheaper = rows.filter((r) => r.diffKr < 0);

        const totalOverCost = moreExpensive.reduce((a, r) => a + r.diffKr, 0);
        const avgDiffKr = matched ? rows.reduce((a, r) => a + r.diffKr, 0) / matched : 0;

        const mPrices = rows.map((r) => r.marketPrice).filter((n) => n > 0);
        const cPrices = rows.map((r) => r.companyPrice).filter((n) => n > 0);

        const mAvg = mPrices.length ? mPrices.reduce((s, x) => s + x, 0) / mPrices.length : null;
        const cAvg = cPrices.length ? cPrices.reduce((s, x) => s + x, 0) / cPrices.length : null;

        const worst = [...rows].sort((a, b) => b.diffKr - a.diffKr)[0] || null;
        const best = [...rows].sort((a, b) => a.diffKr - b.diffKr)[0] || null;

        return {
            matched,
            expensiveCount: moreExpensive.length,
            cheaperCount: cheaper.length,
            totalOverCost,
            avgDiffKr,
            mAvg,
            cAvg,
            worst,
            best,
        };
    }, [rows]);

    const focusRow = useMemo(() => {
        if (!focus) return null;
        return rows.find((r) => String(r.ean) === String(focus)) || null;
    }, [rows, focus]);

    const pickFocus = (ean) => {
        const sp = new URLSearchParams(searchParams);
        sp.set("focus", String(ean));
        setSearchParams(sp);
    };

    const clearFocus = () => {
        const sp = new URLSearchParams(searchParams);
        sp.delete("focus");
        setSearchParams(sp);
    };

    // Dashboard derived
    const actionCounts = dash?.meta?.actionCounts || {};
    const quality = dash?.meta?.quality || {};
    const health = dash?.meta?.health || {};
    const coverage = dash?.meta?.coverage || {};

    const openQueueTab = (t) => setQueueType(String(t).toUpperCase());

    const gotoProductsWithEan = (ean) => {
        const sp = new URLSearchParams();
        sp.set("source", "company");
        sp.set("q", String(ean));
        nav(`/products?${sp.toString()}`);
    };

    if (loading) {
        return (
            <section className="apage">
                <div className="bento-grid">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} height={140} />
                    ))}
                </div>
            </section>
        );
    }

    if (err) {
        return (
            <section className="apage">
                <ErrorState error={{ message: err }} retry={() => window.location.reload()} />
            </section>
        );
    }

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Dashboard</div>
                    <p className="apage__sub">Prisanalys och marknadsintelligens i realtid</p>
                </div>

                <div className="apage__actions">
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök produkter..."
                        style={{ width: 320 }}
                        icon={<SearchIcon />}
                    />
                    <Button disabled={!focusRow} onClick={() => nav(`/history?focus=${encodeURIComponent(String(focusRow?.ean))}`)}>
                        Visa historik
                    </Button>
                    {focus && (
                        <Button variant="ghost" onClick={clearFocus}>
                            Rensa
                        </Button>
                    )}
                </div>
            </header>

            {/* =========================
          A) ACTION SUMMARY + HEALTH
      ========================= */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-pad">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>Action queues</div>
                            {dashLoading ? (
                                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Laddar…</span>
                            ) : dashErr ? (
                                <span style={{ color: "var(--danger)", fontSize: 13 }}>{dashErr}</span>
                            ) : (
                                <>
                                    <Button size="sm" variant="ghost" onClick={() => openQueueTab("OVERPRICED")}>
                                        Overpriced: {formatNumber(Number(actionCounts.OVERPRICED ?? 0))}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => openQueueTab("UNDERPRICED")}>
                                        Underpriced: {formatNumber(Number(actionCounts.UNDERPRICED ?? 0))}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => openQueueTab("OUTLIERS")}>
                                        Outliers: {formatNumber(Number(actionCounts.OUTLIERS ?? 0))}
                                    </Button>
                                </>
                            )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {!dashLoading && !dashErr && <QualityPill q={quality.benchmarkQuality} />}

                            <Button size="sm" variant="secondary" onClick={loadDashboardOverview}>
                                Uppdatera dashboard
                            </Button>
                        </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {dashLoading ? (
                            <Skeleton height={26} style={{ width: 520 }} />
                        ) : dashErr ? (
                            <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                Kunde inte läsa dashboard-health. (Compare-vyn fungerar ändå.)
              </span>
                        ) : (
                            <>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Freshness: <span style={{ color: "var(--text-primary)" }}>{fmtIsoShort(dash?.dataFreshness)}</span>
                </span>
                                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Computed: <span style={{ color: "var(--text-primary)" }}>{fmtIsoShort(health?.computedAt)}</span>
                </span>
                                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Coverage:{" "}
                                    <span style={{ color: "var(--text-primary)" }}>
                    {formatNumber(Number(coverage?.matchedPriced ?? dash?.matchedProducts ?? 0))} /
                                        {formatNumber(Number(coverage?.totalProducts ?? dash?.totalProducts ?? 0))} priced
                  </span>
                </span>

                                {health?.notes && (
                                    <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    Note: <span style={{ color: "var(--text-primary)" }}>{String(health.notes)}</span>
                  </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* =========================
          A) QUEUE PANEL
      ========================= */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-pad">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>Work queue</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
                                Klicka en rad för att öppna i Produkter och göra åtgärd (AUTO/MANUAL).
                            </div>
                        </div>

                        <QueueTabs value={queueType} onChange={setQueueType} counts={actionCounts} />
                    </div>

                    <div style={{ marginTop: 12 }}>
                        {queueLoading ? (
                            <div>
                                <Skeleton height={48} />
                                <Skeleton height={48} style={{ marginTop: 8 }} />
                                <Skeleton height={48} style={{ marginTop: 8 }} />
                            </div>
                        ) : queueErr ? (
                            <ErrorState error={{ message: queueErr }} retry={() => loadQueue(queueType)} />
                        ) : !queue?.items?.length ? (
                            <EmptyState
                                title="Inga items i kön"
                                description="Det betyder oftast att allt ligger inom toleransen (eller att outlier-tröskeln är hög)."
                                icon="✅"
                            />
                        ) : (
                            <div className="tableWrap">
                                <table className="table">
                                    <thead>
                                    <tr>
                                        <th className="th">Produkt</th>
                                        <th className="th">EAN</th>
                                        <th className="th">Marknad</th>
                                        <th className="th">Vårt</th>
                                        <th className="th">Gap</th>
                                        <th className="th"></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {queue.items.map((it) => {
                                        const gapKr = Number(it.gapKr ?? 0);
                                        const gapPct = Number(it.gapPct ?? 0) * 100;
                                        const variant = gapKr > 0 ? "danger" : gapKr < 0 ? "success" : "neutral";

                                        return (
                                            <tr
                                                key={`${it.id}-${it.ean}`}
                                                className="tr"
                                                onClick={() => gotoProductsWithEan(it.ean)}
                                                style={{ cursor: "pointer" }}
                                                title="Öppna i Produkter"
                                            >
                                                <td className="td">
                                                    <div style={{ fontWeight: 650 }}>{it.name || "—"}</div>
                                                    <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                                                        {it.brand || "—"} · {it.category || "—"} · ID: {it.id}
                                                    </div>
                                                </td>

                                                <td className="td" style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-secondary)" }}>
                                                    {it.ean || "—"}
                                                </td>

                                                <td className="td">{formatMoney(it.marketPrice)}</td>
                                                <td className="td">{formatMoney(it.ourPrice)}</td>

                                                <td className="td">
                            <span className={`statusPill statusPill--${variant}`}>
                              {gapKr >= 0 ? "+" : ""}
                                {formatMoney(gapKr).replace(" kr", "")} kr ({gapPct >= 0 ? "+" : ""}
                                {gapPct.toFixed(1)}%)
                            </span>
                                                </td>

                                                <td className="td" style={{ textAlign: "right", width: 180 }}>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            gotoProductsWithEan(it.ean);
                                                        }}
                                                    >
                                                        Öppna i produkter →
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {!queueLoading && queue?.meta?.rules && (
                        <div style={{ marginTop: 10, color: "var(--text-tertiary)", fontSize: 12 }}>
                            Rule: {String(queue.meta.rules)}
                        </div>
                    )}
                </div>
            </div>

            {/* =========================
          DIN BEFINTLIGA BENTO GRID (compare-baserad)
      ========================= */}
            <div className="bento-grid">
                <BentoCard
                    icon="📦"
                    label="Matchade produkter"
                    value={formatNumber(stats.matched)}
                    change={`${stats.expensiveCount} dyrare, ${stats.cheaperCount} billigare`}
                    changeType="neutral"
                />
                <BentoCard
                    icon="💰"
                    label="Total överkostnad"
                    value={formatMoney(Math.round(stats.totalOverCost))}
                    change={formatMoney(stats.avgDiffKr) + " i snitt"}
                    changeType={stats.avgDiffKr > 0 ? "negative" : "positive"}
                />
                <BentoCard icon="📈" label="Marknadspris (snitt)" value={formatMoney(stats.mAvg)} change="Genomsnitt" changeType="neutral" />
                <BentoCard
                    icon="🏷️"
                    label="Vårt pris (snitt)"
                    value={formatMoney(stats.cAvg)}
                    change={stats.avgDiffKr > 0 ? `+${formatMoney(stats.avgDiffKr)}` : formatMoney(stats.avgDiffKr)}
                    changeType={stats.avgDiffKr > 0 ? "negative" : "positive"}
                />
                <BentoCard
                    icon="⚠️"
                    label="Största avvikelse"
                    value={stats.worst ? formatMoney(stats.worst.diffKr) : "—"}
                    change={stats.worst?.name || "Ingen data"}
                    changeType="negative"
                />
                <BentoCard
                    icon="✓"
                    label="Bästa pris"
                    value={stats.best ? formatMoney(stats.best.diffKr) : "—"}
                    change={stats.best?.name || "Ingen data"}
                    changeType="positive"
                />
            </div>

            {/* FOCUS PRODUCT */}
            {focusRow ? (
                <div className="card">
                    <div className="card-pad">
                        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                            <ProductThumb src={focusRow.imageUrl} alt={focusRow.name} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{focusRow.name}</div>
                                <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
                                    {focusRow.brand} · {focusRow.category} · EAN: {focusRow.ean}
                                </div>
                            </div>
                            <StatusPill diffKr={focusRow.diffKr} diffPct={focusRow.diffPct} />
                        </div>

                        <PriceHistory fetchJson={api.request.bind(api)} ean={focusRow.ean} title="Prishistorik" />
                    </div>
                </div>
            ) : (
                <div className="card">
                    <div className="card-pad">
                        <EmptyState
                            title="Ingen produkt vald"
                            description="Välj en produkt från listan nedan för att se detaljerad prishistorik."
                            icon="📊"
                        />
                    </div>
                </div>
            )}

            {/* PRODUCT LIST */}
            <div className="card">
                <div className="card-pad">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Produkter med störst avvikelse</h3>
                        <div style={{ display: "flex", gap: 8 }}>
                            <Button variant="ghost" size="sm" disabled={!stats.worst} onClick={() => stats.worst && pickFocus(stats.worst.ean)}>
                                Välj dyrast
                            </Button>
                            <Button variant="ghost" size="sm" disabled={!stats.best} onClick={() => stats.best && pickFocus(stats.best.ean)}>
                                Välj billigast
                            </Button>
                        </div>
                    </div>

                    <div className="tableWrap">
                        <table className="table">
                            <thead>
                            <tr>
                                <th className="th"></th>
                                <th className="th">Produkt</th>
                                <th className="th">EAN</th>
                                <th className="th">Marknad</th>
                                <th className="th">Vårt pris</th>
                                <th className="th">Status</th>
                            </tr>
                            </thead>
                            <tbody>
                            {rows.slice(0, 10).map((r) => (
                                <tr key={r.ean} className="tr" onClick={() => pickFocus(r.ean)}>
                                    <td className="td" style={{ width: 60 }}>
                                        <ProductThumb src={r.imageUrl} alt={r.name} />
                                    </td>
                                    <td className="td">
                                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                                        <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                                            {r.brand} · {r.category}
                                        </div>
                                    </td>
                                    <td className="td" style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-secondary)" }}>
                                        {r.ean}
                                    </td>
                                    <td className="td">{formatMoney(r.marketPrice)}</td>
                                    <td className="td">{formatMoney(r.companyPrice)}</td>
                                    <td className="td">
                                        <StatusPill diffKr={r.diffKr} diffPct={r.diffPct} />
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}
