import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatNumber } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { useDebounce } from "../hooks/useDebounce";

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

function BentoCard({ icon, label, value, change, changeType, large, onClick, hint }) {
    const clickable = typeof onClick === "function";
    return (
        <div
            className={`bento-card ${large ? "bento-card--large" : ""} ${
                clickable ? "bento-card--clickable" : ""
            }`}
            onClick={onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={hint || (clickable ? "Öppna" : undefined)}
            onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === "Enter" || e.key === " ") onClick?.();
            }}
            style={clickable ? { cursor: "pointer" } : undefined}
        >
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

/* =========================
   Dashboard UI widgets
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

    const queueRef = useRef(null);

    // Compare search (för snabb navigering + overprice-summering)
    const [q, setQ] = useState("");
    const debouncedQ = useDebounce(q, 300);

    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    // Dashboard overview + queues
    const [dash, setDash] = useState(null);
    const [dashErr, setDashErr] = useState("");
    const [dashLoading, setDashLoading] = useState(true);

    const [queueType, setQueueType] = useState(searchParams.get("queue") || "UNDERPRICED");
    const [queue, setQueue] = useState(null);
    const [queueErr, setQueueErr] = useState("");
    const [queueLoading, setQueueLoading] = useState(true);

    // Keep queue in URL
    useEffect(() => {
        const sp = new URLSearchParams(searchParams);
        if (queueType) sp.set("queue", queueType);
        setSearchParams(sp, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueType]);

    // Fetch compare (behåll för "Total overprice" + navigation)
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

    // Fetch dashboard overview
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

    // Fetch queue
    const loadQueue = useCallback(async (type) => {
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
    }, []);

    useEffect(() => {
        loadQueue(queueType);
    }, [queueType, loadQueue]);

    // Dashboard derived
    const actionCounts = dash?.meta?.actionCounts || {};
    const quality = dash?.meta?.quality || {};
    const health = dash?.meta?.health || {};
    const coverage = dash?.meta?.coverage || {};

    // ✅ KPI: use DASH coverage in DB-mode (fixar 1535 vs 2859)
    const kpis = useMemo(() => {
        const matchedMarket = Number(coverage?.matchedMarket ?? coverage?.matched_market ?? dash?.matchedProducts ?? 0);
        const matchedPriced = Number(coverage?.matchedPriced ?? coverage?.matched_priced ?? 0);

        // If backend doesn't send needsPricing yet, compute it safely client-side.
        const needsPricing = Number(
            coverage?.needsPricing ?? coverage?.needs_pricing ?? Math.max(0, matchedMarket - matchedPriced)
        );

        // Compare-derived (optional): total overprice + avg gap
        let totalOverCost = 0;
        let avgDiffKr = 0;

        const arr = Array.isArray(data?.matched) ? data.matched : [];
        if (arr.length) {
            const diffs = arr.map((r) => Number(r?.gapKr ?? r?.priceDiff ?? 0));
            const sum = diffs.reduce((a, x) => a + x, 0);
            avgDiffKr = sum / arr.length;
            totalOverCost = diffs.filter((x) => x > 0).reduce((a, x) => a + x, 0);
        }

        return { matchedMarket, matchedPriced, needsPricing, totalOverCost, avgDiffKr };
    }, [coverage, dash, data]);

    const openQueueTab = (t) => {
        setQueueType(String(t).toUpperCase());
        requestAnimationFrame(() => {
            queueRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
    };

    // ack baseline before navigating from queue -> products
    const gotoProductsWithEan = async (ean, id) => {
        try {
            if (id != null) {
                await api.request(`/api/company/${encodeURIComponent(String(id))}/ack-market`, {
                    method: "POST",
                });
            }
        } catch {
            // ignore; navigation should still work
        }

        const sp = new URLSearchParams();
        sp.set("source", "db");
        sp.set("q", String(ean));
        nav(`/products?${sp.toString()}`);
    };

    if (loading) {
        return (
            <section className="apage">
                <div className="bento-grid">
                    {[...Array(8)].map((_, i) => (
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

    const overpricedN = Number(actionCounts.OVERPRICED ?? 0);
    const underpricedN = Number(actionCounts.UNDERPRICED ?? 0);
    const outliersN = Number(actionCounts.OUTLIERS ?? 0);

    const matchedValue = dashLoading ? "…" : formatNumber(kpis.matchedMarket);
    const matchedChange =
        dashLoading
            ? ""
            : `Priced: ${formatNumber(kpis.matchedPriced)} · Needs: ${formatNumber(kpis.needsPricing)}`;

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Dashboard</div>
                    <p className="apage__sub">Priceanalyzis and marketintelligense in realtime</p>
                </div>

                <div className="apage__actions">
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search products..."
                        style={{ width: 320 }}
                        icon={<SearchIcon />}
                    />
                    <Button
                        variant="ghost"
                        onClick={() => {
                            const sp = new URLSearchParams();
                            sp.set("source", "db");
                            if (q) sp.set("q", q);
                            nav(`/products?${sp.toString()}`);
                        }}
                    >
                        Open Products →
                    </Button>
                </div>
            </header>

            {/* HERO BENTO */}
            <div className="bento-grid" style={{ marginBottom: 16 }}>
                <BentoCard
                    icon="📦"
                    label="Matched products"
                    value={matchedValue}
                    change={matchedChange}
                    changeType="neutral"
                    hint="DB coverage: matchedMarket = inventory with market link. Priced = benchmark + our comparable. Needs = remaining."
                />

                <BentoCard
                    icon="🔥"
                    label="Overpriced"
                    value={dashLoading ? "…" : formatNumber(overpricedN)}
                    change="Fix in Work Queue"
                    changeType="negative"
                    onClick={() => openQueueTab("OVERPRICED")}
                    hint="Öppna OVERPRICED-kön"
                />

                <BentoCard
                    icon="🧊"
                    label="Underpriced"
                    value={dashLoading ? "…" : formatNumber(underpricedN)}
                    change="Fix in Work Queue"
                    changeType="positive"
                    onClick={() => openQueueTab("UNDERPRICED")}
                    hint="Öppna UNDERPRICED-kön"
                />

                <BentoCard
                    icon="⚠️"
                    label="Outliers"
                    value={dashLoading ? "…" : formatNumber(outliersN)}
                    change="Weird gap"
                    changeType="negative"
                    onClick={() => openQueueTab("OUTLIERS")}
                    hint="Öppna OUTLIERS-kön"
                />

                <BentoCard
                    icon="💰"
                    label="Total overprice"
                    value={formatMoney(Math.round(kpis.totalOverCost))}
                    change={formatMoney(kpis.avgDiffKr) + " in avg"}
                    changeType={kpis.avgDiffKr > 0 ? "negative" : "positive"}
                />
            </div>

            {/* ACTION SUMMARY + HEALTH */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-pad">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
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
                                Update dashboard
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
                  Date: <span style={{ color: "var(--text-primary)" }}>{fmtIsoShort(dash?.dataFreshness)}</span>
                </span>
                                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Computed:{" "}
                                    <span style={{ color: "var(--text-primary)" }}>{fmtIsoShort(health?.computedAt)}</span>
                </span>
                                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  Coverage:{" "}
                                    <span style={{ color: "var(--text-primary)" }}>
                    {formatNumber(Number(coverage?.matchedPriced ?? dash?.matchedProducts ?? 0))} /{" "}
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

            {/* QUEUE PANEL */}
            <div className="card" style={{ marginBottom: 16 }} ref={queueRef}>
                <div className="card-pad">
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>Work queue</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
                                Click on a line to open in Products and make a change (AUTO/MANUAL).
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
                                title="No items i queue"
                                description="It usually means everything is within acceptable parameters (or that outlier-threshold is too high)."
                                icon="✅"
                            />
                        ) : (
                            <div className="tableWrap">
                                <table className="table">
                                    <thead>
                                    <tr>
                                        <th className="th">Product</th>
                                        <th className="th">EAN</th>
                                        <th className="th">Market</th>
                                        <th className="th">Ours</th>
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
                                                onClick={() => gotoProductsWithEan(it.ean, it.id)}
                                                style={{ cursor: "pointer" }}
                                                title="Öppna i Produkter"
                                            >
                                                <td className="td">
                                                    <div style={{ fontWeight: 650 }}>{it.name || "—"}</div>
                                                    <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
                                                        {it.brand || "—"} · {it.category || "—"} · ID: {it.id}
                                                    </div>
                                                </td>

                                                <td
                                                    className="td"
                                                    style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-secondary)" }}
                                                >
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
                                                            gotoProductsWithEan(it.ean, it.id);
                                                        }}
                                                    >
                                                        Open in Products →
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
        </section>
    );
}