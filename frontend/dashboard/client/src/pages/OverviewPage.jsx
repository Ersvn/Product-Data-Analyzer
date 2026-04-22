import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatNumber } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";

const QUEUE_TYPES = ["OVERPRICED", "UNDERPRICED", "OUTLIERS"];

function getGapTone(gapKr) {
    if (gapKr > 0) return "danger";
    if (gapKr < 0) return "success";
    return "neutral";
}

function MetricCard({ icon, label, value, hint, tone = "neutral", onClick }) {
    const clickable = typeof onClick === "function";

    return (
        <div
            className={`bento-card ${clickable ? "bento-card--clickable" : ""}`}
            onClick={onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === "Enter" || e.key === " ") onClick?.();
            }}
        >
            <div className={`bento-card__icon bento-card__icon--${tone}`}>{icon}</div>
            <div className="bento-card__label">{label}</div>
            <div className="bento-card__value">{value}</div>
            {hint ? (
                <div className={`bento-card__change bento-card__change--${tone}`}>
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

function QueueTabs({ value, onChange, counts }) {
    return (
        <div className="segmented">
            {QUEUE_TYPES.map((key) => {
                const label =
                    key === "OVERPRICED"
                        ? "Overpriced"
                        : key === "UNDERPRICED"
                            ? "Underpriced"
                            : "Outliers";

                return (
                    <button
                        key={key}
                        type="button"
                        className={`segBtn ${value === key ? "segBtnActive" : ""}`}
                        onClick={() => onChange(key)}
                    >
                        {label} ({formatNumber(Number(counts?.[key] ?? 0))})
                    </button>
                );
            })}
        </div>
    );
}

function buildAverageGapLabel(avgAbsGapKr) {
    const value = Number(avgAbsGapKr ?? 0);
    if (!Number.isFinite(value) || value <= 0) return "No pricing gap data";
    return `Avg gap: ${formatMoney(Math.round(value))}`;
}

export default function OverviewPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const queueRef = useRef(null);

    const [dashboard, setDashboard] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState("");

    const [queueType, setQueueType] = useState(searchParams.get("queue") || "UNDERPRICED");
    const [queueData, setQueueData] = useState(null);
    const [queueLoading, setQueueLoading] = useState(true);
    const [queueError, setQueueError] = useState("");

    useEffect(() => {
        const sp = new URLSearchParams(searchParams);
        sp.set("queue", queueType);
        setSearchParams(sp, { replace: true });
    }, [queueType]);

    const loadDashboard = useCallback(async () => {
        setDashboardLoading(true);
        setDashboardError("");

        try {
            const result = await api.request("/api/dashboard/overview?days=30");
            setDashboard(result);
        } catch (error) {
            setDashboardError(String(error?.message || error));
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    const loadQueue = useCallback(async (type) => {
        setQueueLoading(true);
        setQueueError("");

        try {
            const result = await api.request(
                `/api/dashboard/queue?type=${encodeURIComponent(String(type))}&limit=25`
            );
            setQueueData(result);
        } catch (error) {
            setQueueError(String(error?.message || error));
        } finally {
            setQueueLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        loadQueue(queueType);
    }, [queueType, loadQueue]);

    const actionCounts = useMemo(() => {
        const rawActionCounts = dashboard?.meta?.actionCounts ?? {};

        return {
            OVERPRICED: Number(rawActionCounts.OVERPRICED ?? rawActionCounts.moreExpensive ?? 0),
            UNDERPRICED: Number(rawActionCounts.UNDERPRICED ?? rawActionCounts.cheaper ?? 0),
            OUTLIERS: Number(rawActionCounts.OUTLIERS ?? rawActionCounts.outliers ?? 0),
        };
    }, [dashboard]);

    const derived = useMemo(() => {
        const coverage = dashboard?.meta?.coverage ?? {};
        const pricing = dashboard?.meta?.pricing ?? {};

        const matchedMarket = Number(coverage.matchedProducts ?? dashboard?.matchedProducts ?? 0);
        const matchedPriced = Number(coverage.matchedPriced ?? coverage.comparableCount ?? 0);
        const needsPricing = Number(coverage.needsPricing ?? Math.max(0, matchedMarket - matchedPriced));
        const totalOverprice = Number(pricing.totalOverpriceKr ?? 0);
        const avgGapLabel = buildAverageGapLabel(pricing.avgAbsGapKr);

        return {
            matchedMarket,
            matchedPriced,
            needsPricing,
            totalOverprice,
            avgGapLabel,
        };
    }, [dashboard]);

    function openQueue(type) {
        setQueueType(type);
        requestAnimationFrame(() => {
            queueRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
    }

    function openProductByEan(ean) {
        const sp = new URLSearchParams();
        sp.set("source", "inventory");
        sp.set("q", String(ean));
        navigate(`/products?${sp.toString()}`);
    }

    if (dashboardLoading && !dashboard) {
        return (
            <section className="apage">
                <div className="bento-grid">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} height={146} radius={20} />
                    ))}
                </div>

                <div className="card">
                    <div className="card-pad">
                        <Skeleton height={44} />
                        <Skeleton height={44} style={{ marginTop: 8 }} />
                        <Skeleton height={44} style={{ marginTop: 8 }} />
                    </div>
                </div>
            </section>
        );
    }

    if (dashboardError && !dashboard) {
        return (
            <section className="apage">
                <ErrorState
                    error={{ message: dashboardError }}
                    retry={() => window.location.reload()}
                />
            </section>
        );
    }

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Overview</div>
                    <h1 className="apage__title">Price Comparer</h1>
                    <p className="apage__sub">
                        Quick overview of pricing pressure and what action is recommended.
                    </p>
                </div>

                <div className="apage__actions">
                    <Button size="sm" variant="secondary" onClick={loadDashboard}>
                        Refresh
                    </Button>
                </div>
            </header>

            <section className="bento-grid">
                <MetricCard
                    icon="INV"
                    label="Matched products"
                    value={dashboardLoading ? "..." : formatNumber(derived.matchedMarket)}
                    tone="neutral"
                    hint={
                        dashboardLoading
                            ? ""
                            : `Priced: ${formatNumber(derived.matchedPriced)} | Needs: ${formatNumber(derived.needsPricing)}`
                    }
                />

                <MetricCard
                    icon="HIGH"
                    label="Overpriced"
                    value={dashboardLoading ? "..." : formatNumber(actionCounts.OVERPRICED)}
                    tone="negative"
                    hint="Fix in Work Queue"
                    onClick={() => openQueue("OVERPRICED")}
                />

                <MetricCard
                    icon="LOW"
                    label="Underpriced"
                    value={dashboardLoading ? "..." : formatNumber(actionCounts.UNDERPRICED)}
                    tone="positive"
                    hint="Fix in Work Queue"
                    onClick={() => openQueue("UNDERPRICED")}
                />

                <MetricCard
                    icon="WARN"
                    label="Outliers"
                    value={dashboardLoading ? "..." : formatNumber(actionCounts.OUTLIERS)}
                    tone="negative"
                    hint="Weird gap"
                    onClick={() => openQueue("OUTLIERS")}
                />

                <MetricCard
                    icon="SEK"
                    label="Total overprice"
                    value={dashboardLoading ? "..." : formatMoney(Math.round(derived.totalOverprice))}
                    tone="neutral"
                    hint={dashboardLoading ? "" : derived.avgGapLabel}
                />
            </section>

            <section className="card" ref={queueRef}>
                <div className="card-pad">
                    <div className="overview-queue-head">
                        <div>
                            <div className="section-title">Work queue</div>
                            <div className="section-sub">
                                Open a row to continue in Products.
                            </div>
                        </div>

                        <QueueTabs value={queueType} onChange={setQueueType} counts={actionCounts} />
                    </div>

                    <div style={{ marginTop: 14 }}>
                        {queueLoading ? (
                            <div>
                                <Skeleton height={48} />
                                <Skeleton height={48} style={{ marginTop: 8 }} />
                                <Skeleton height={48} style={{ marginTop: 8 }} />
                            </div>
                        ) : queueError ? (
                            <ErrorState error={{ message: queueError }} retry={() => loadQueue(queueType)} />
                        ) : !queueData?.items?.length ? (
                            <EmptyState
                                title="No items in queue"
                                description="Everything is currently inside acceptable limits."
                                icon="OK"
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
                                        {queueData.items.map((item) => {
                                            const gapKr = Number(item?.gapKr ?? 0);
                                            const gapPct = Number(item?.gapPct ?? 0) * 100;
                                            const tone = getGapTone(gapKr);

                                            return (
                                                <tr
                                                    key={`${item.id}-${item.ean}`}
                                                    className="tr"
                                                    onClick={() => openProductByEan(item.ean)}
                                                    style={{ cursor: "pointer" }}
                                                    title="Open in Products"
                                                >
                                                    <td className="td">
                                                        <div className="overview-product">
                                                            <div className="overview-product__name">{item.name || "-"}</div>
                                                            <div className="overview-product__meta">
                                                                {item.brand || "-"} | {item.category || "-"} | ID: {item.id}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td
                                                        className="td"
                                                        style={{
                                                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                                            fontSize: 13,
                                                            color: "var(--text-secondary)",
                                                        }}
                                                    >
                                                        {item.ean || "-"}
                                                    </td>

                                                    <td className="td">{formatMoney(item.marketPrice)}</td>
                                                    <td className="td">{formatMoney(item.ourPrice)}</td>

                                                    <td className="td">
                                                        <span className={`statusPill statusPill--${tone}`}>
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
                                                                openProductByEan(item.ean);
                                                            }}
                                                        >
                                                            Open -&gt;
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
                </div>
            </section>
        </section>
    );
}
