import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { formatMoney, formatNumber } from "../lib/utils";

function statusVariant(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "RUNNING") return "success";
    if (normalized === "FAILED") return "danger";
    if (normalized === "COMPLETED") return "default";
    if (normalized === "STOPPING") return "warning";
    return "default";
}

function parseResultLine(line = "") {
    const raw = String(line || "").trim();
    if (!raw) return null;

    let type = null;
    if (raw.includes("🆕 CREATED")) type = "created";
    else if (raw.includes("✅ UPDATED")) type = "updated";
    else if (raw.includes("❌ FAILED")) type = "failed";
    else if (raw.includes("⚠️ SUSPECT")) type = "suspect";
    else return null;

    const siteProgressMatch = raw.match(/\[(\d+)\/(\d+)\]/);
    const batchProgressMatch = raw.match(/\[batch\s+(\d+)\/(\d+)\]/i);

    const siteCurrent = siteProgressMatch ? Number(siteProgressMatch[1]) : null;
    const siteTotal = siteProgressMatch ? Number(siteProgressMatch[2]) : null;
    const batchCurrent = batchProgressMatch ? Number(batchProgressMatch[1]) : null;
    const batchTotal = batchProgressMatch ? Number(batchProgressMatch[2]) : null;

    let productName = "Okänd produkt";
    let price = null;
    let ean = null;
    let mpn = null;
    let sku = null;
    let pass = null;
    let source = null;
    let identifierCount = null;

    if (type === "created" || type === "updated" || type === "suspect") {
        const typeToken =
            type === "created"
                ? "🆕 CREATED"
                : type === "updated"
                    ? "✅ UPDATED"
                    : "⚠️ SUSPECT";

        const tail = raw.split(typeToken)[1]?.trim() || "";
        const parts = tail.split("|").map((p) => p.trim()).filter(Boolean);

        const maybePrice = tail.match(/(\d+(?:[.,]\d+)?)\s*kr/i);
        if (maybePrice) {
            price = Number(String(maybePrice[1]).replace(",", "."));
        }

        const passMatch = tail.match(/\bP(\d)\b/i);
        if (passMatch) pass = Number(passMatch[1]);

        const sourceMatch = tail.match(/\bP\d\|([A-Z]+)\|ID:(\d+)/i);
        if (sourceMatch) {
            source = sourceMatch[1];
            identifierCount = Number(sourceMatch[2]);
        }

        const eanMatch = tail.match(/EAN[=:]\s*([A-Za-z0-9._\-\/]+)/i);
        const mpnMatch = tail.match(/MPN[=:]\s*([A-Za-z0-9._\-\/]+)/i);
        const skuMatch = tail.match(/SKU[=:]\s*([A-Za-z0-9._\-\/]+)/i);

        ean = eanMatch?.[1] || null;
        mpn = mpnMatch?.[1] || null;
        sku = skuMatch?.[1] || null;

        if (parts.length > 0) {
            productName = parts[parts.length - 1] || "Okänd produkt";
        }

        if (ean === "N/A") ean = null;
        if (mpn === "N/A") mpn = null;
        if (sku === "N/A") sku = null;
    }

    if (type === "failed") {
        const tail = raw.split("❌ FAILED")[1]?.trim() || "";
        productName = tail || "Kunde inte läsa produkt";
    }

    return {
        raw,
        type,
        productName,
        price,
        ean,
        mpn,
        sku,
        pass,
        source,
        identifierCount,
        siteCurrent,
        siteTotal,
        batchCurrent,
        batchTotal,
    };
}

function typeLabel(type) {
    if (type === "created") return "Created";
    if (type === "updated") return "Updated";
    if (type === "failed") return "Error";
    if (type === "suspect") return "Suspect";
    return "Unknown";
}

function typeTone(type) {
    if (type === "created") return "success";
    if (type === "updated") return "info";
    if (type === "failed") return "danger";
    if (type === "suspect") return "warning";
    return "default";
}

function itemProgressLabel(item) {
    if (item.siteCurrent && item.siteTotal) {
        return `${item.siteCurrent}/${item.siteTotal}`;
    }
    if (item.batchCurrent && item.batchTotal) {
        return `${item.batchCurrent}/${item.batchTotal}`;
    }
    return "—";
}

export default function ScraperPage() {
    const [status, setStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [runs, setRuns] = useState([]);
    const [products, setProducts] = useState([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [activeTab, setActiveTab] = useState("results");
    const [expandedIndexes, setExpandedIndexes] = useState(() => new Set());
    const resultListRef = useRef(null);

    const refreshAll = useCallback(async () => {
        try {
            const [statusRes, logsRes, runsRes, productsRes] = await Promise.all([
                api.fetchScraperStatus(),
                api.fetchScraperLogs({ limit: 250 }),
                api.fetchScraperRuns({ limit: 10 }),
                api.fetchDbScrapedMarket({ q: query, limit: 50 }),
            ]);

            setStatus(statusRes || null);
            setLogs(Array.isArray(logsRes?.logs) ? logsRes.logs : []);
            setRuns(Array.isArray(runsRes?.runs) ? runsRes.runs : []);
            setProducts(
                Array.isArray(productsRes?.items)
                    ? productsRes.items
                    : productsRes?.rows || productsRes || []
            );
            setError("");
        } catch (err) {
            setError(String(err.message || err));
        } finally {
            setLoading(false);
        }
    }, [query]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        const interval = setInterval(() => {
            refreshAll();
        }, status?.running ? 1500 : 4000);

        return () => clearInterval(interval);
    }, [refreshAll, status?.running]);

    const resultEvents = useMemo(() => {
        return logs
            .map((line, index) => {
                const parsed = parseResultLine(line);
                if (!parsed) return null;
                return { index, ...parsed };
            })
            .filter(Boolean);
    }, [logs]);

    useEffect(() => {
        if (status?.running && activeTab === "results" && resultListRef.current) {
            const el = resultListRef.current;
            el.scrollTop = el.scrollHeight;
        }
    }, [resultEvents, status?.running, activeTab]);

    const summary = useMemo(() => {
        return resultEvents.reduce(
            (acc, item) => {
                if (item.type === "created") acc.created += 1;
                if (item.type === "updated") acc.updated += 1;
                if (item.type === "failed") acc.failed += 1;
                if (item.type === "suspect") acc.suspect += 1;
                return acc;
            },
            { created: 0, updated: 0, failed: 0, suspect: 0 }
        );
    }, [resultEvents]);

    const handleStart = async () => {
        try {
            setActionLoading(true);
            await api.startScraper();
            await refreshAll();
        } catch (err) {
            setError(String(err.message || err));
        } finally {
            setActionLoading(false);
        }
    };

    const handleStop = async () => {
        try {
            setActionLoading(true);
            await api.stopScraper();
            await refreshAll();
        } catch (err) {
            setError(String(err.message || err));
        } finally {
            setActionLoading(false);
        }
    };

    const toggleExpanded = (idx) => {
        setExpandedIndexes((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const stats = useMemo(
        () => ({
            discovered: status?.discovered ?? 0,
            skipped: status?.skipped ?? 0,
            created: status?.created ?? 0,
            updated: status?.updated ?? 0,
            failed: status?.failed ?? 0,
            suspectedChanges: status?.suspectedChanges ?? 0,
        }),
        [status]
    );

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Realtime</div>
                    <h1 className="apage__title">Scraper</h1>
                    <p className="apage__sub">
                        Följ vad som skapas, uppdateras och failar medan scrapern kör.
                    </p>
                </div>

                <div className="apage__actions" style={{ flexWrap: "wrap" }}>
                    <Badge variant={statusVariant(status?.status)}>
                        {status?.status || "IDLE"}
                    </Badge>

                    <Button onClick={handleStart} disabled={actionLoading || status?.running}>
                        {actionLoading && !status?.running ? "Startar..." : "Start scrape"}
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={handleStop}
                        disabled={actionLoading || !status?.running}
                    >
                        Stop
                    </Button>

                    <Button variant="ghost" onClick={refreshAll}>
                        Refresh
                    </Button>
                </div>
            </header>

            {error && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="card-pad" style={{ color: "var(--danger, #ef4444)" }}>
                        {error}
                    </div>
                </div>
            )}

            <div className="scraper-grid-top">
                <div className="card">
                    <div className="card-pad scraper-stat-card scraper-stat-card--status">
                        <div className="scraper-stat-card__label">Status</div>
                        <div
                            className="scraper-stat-card__value"
                            style={{ display: "flex", gap: 10, alignItems: "center" }}
                        >
                            {status?.running && <span className="scraper-pulse" />}
                            <span>{status?.status || "IDLE"}</span>
                        </div>
                        <div className="scraper-stat-card__sub">
                            {status?.currentSite || "No active site"}
                        </div>

                        <div className="scraper-statusbar">
                            <div
                                className={
                                    status?.running
                                        ? "scraper-statusbar__fill scraper-statusbar__fill--animated"
                                        : "scraper-statusbar__fill"
                                }
                                style={{
                                    width: status?.running
                                        ? "45%"
                                        : status?.status === "COMPLETED"
                                            ? "100%"
                                            : "0%",
                                }}
                            />
                        </div>

                        <div className="scraper-stat-card__mini">
                            {status?.running
                                ? ""
                                : status?.status === "COMPLETED"
                                    ? "Senaste körning färdig"
                                    : "Väntar på start"}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-pad scraper-stat-card">
                        <div className="scraper-stat-card__label">Discovered</div>
                        <div className="scraper-stat-card__value">
                            {formatNumber(stats.discovered)}
                        </div>
                        <div className="scraper-stat-card__sub">
                            {formatNumber(stats.skipped)} skipped by cache
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-pad scraper-stat-card">
                        <div className="scraper-stat-card__label">Created</div>
                        <div className="scraper-stat-card__value">
                            {formatNumber(summary.created || stats.created)}
                        </div>
                        <div className="scraper-stat-card__sub">
                            nya produkter
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-pad scraper-stat-card">
                        <div className="scraper-stat-card__label">Updated / Failed</div>
                        <div className="scraper-stat-card__value">
                            {formatNumber((summary.updated || stats.updated) + (summary.failed || stats.failed))}
                        </div>
                        <div className="scraper-stat-card__sub">
                            {formatNumber(summary.updated || stats.updated)} updated · {formatNumber(summary.failed || stats.failed)} failed
                        </div>
                    </div>
                </div>
            </div>

            <div className="scraper-layout">
                <div className="card scraper-panel">
                    <div className="card-pad">
                        <div className="scraper-panel__header">
                            <div>
                                <h3 className="scraper-panel__title">Scraper activity</h3>
                                <p className="scraper-panel__sub">
                                    Bara produkter som skapats, uppdaterats eller failat
                                </p>
                            </div>
                        </div>

                        <div className="scraper-filterbar">
                            <button
                                type="button"
                                className={`scraper-filterchip ${activeTab === "results" ? "scraper-filterchip--active" : ""}`}
                                onClick={() => setActiveTab("results")}
                            >
                                <span>Results</span>
                                <span className="scraper-filterchip__count">{resultEvents.length}</span>
                            </button>

                            <button
                                type="button"
                                className={`scraper-filterchip ${activeTab === "runs" ? "scraper-filterchip--active" : ""}`}
                                onClick={() => setActiveTab("runs")}
                            >
                                <span>Runs</span>
                                <span className="scraper-filterchip__count">{runs.length}</span>
                            </button>
                        </div>

                        {activeTab === "results" ? (
                            <div className="scraper-resultlist" ref={resultListRef}>
                                {loading ? (
                                    <div className="scraper-empty">Laddar activity...</div>
                                ) : resultEvents.length === 0 ? (
                                    <div className="scraper-empty">Inga produktresultat ännu.</div>
                                ) : (
                                    resultEvents.map((item) => {
                                        const expanded = expandedIndexes.has(item.index);
                                        return (
                                            <button
                                                type="button"
                                                key={`${item.index}-${item.raw}`}
                                                className={`scraper-resultrow scraper-resultrow--${typeTone(item.type)}`}
                                                onClick={() => toggleExpanded(item.index)}
                                            >
                                                <div className="scraper-resultrow__main">
                                                    <div className="scraper-resultrow__top">
                                                        <div className="scraper-resultrow__name">
                                                            {item.productName}
                                                        </div>

                                                        <div className="scraper-resultrow__meta">
                                                            <span className={`scraper-mini-badge scraper-mini-badge--${typeTone(item.type)}`}>
                                                                {typeLabel(item.type)}
                                                            </span>
                                                            <span className="scraper-resultrow__progress">
                                                                {itemProgressLabel(item)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {expanded && (
                                                        <div className="scraper-resultrow__details">
                                                            <div><strong>Pass:</strong> {item.pass || "—"}</div>
                                                            <div><strong>Source:</strong> {item.source || "—"}</div>
                                                            <div><strong>Identifiers:</strong> {item.identifierCount ?? "—"}</div>
                                                            <div><strong>EAN:</strong> {item.ean || "—"}</div>
                                                            <div><strong>MPN:</strong> {item.mpn || "—"}</div>
                                                            <div><strong>SKU:</strong> {item.sku || "—"}</div>
                                                            <div><strong>Pris:</strong> {item.price != null ? `${item.price} kr` : "—"}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            <div className="scraper-runs">
                                {runs.length === 0 ? (
                                    <div className="scraper-empty">Inga körningar sparade ännu.</div>
                                ) : (
                                    runs.map((run) => (
                                        <div key={run.id} className="scraper-runitem">
                                            <div className="scraper-runitem__top">
                                                <strong>{run.status || "UNKNOWN"}</strong>
                                                <span>{run.startedAt || "—"}</span>
                                            </div>
                                            <div className="scraper-runitem__meta">
                                                <span>discovered: {run.discovered ?? 0}</span>
                                                <span>skipped: {run.skipped ?? 0}</span>
                                                <span>created: {run.created ?? 0}</span>
                                                <span>updated: {run.updated ?? 0}</span>
                                                <span>failed: {run.failed ?? 0}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="card scraper-panel">
                    <div className="card-pad">
                        <div className="scraper-panel__header">
                            <div>
                                <h3 className="scraper-panel__title">Latest scraped products</h3>
                                <p className="scraper-panel__sub">
                                    Här dubbelkollar vi att vi läser rätt från nya DB-vyn
                                </p>
                            </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Sök namn / EAN / MPN..."
                            />
                        </div>

                        <div className="scraper-table-wrap">
                            <table className="scraper-table">
                                <thead>
                                <tr>
                                    <th>Site</th>
                                    <th>Name</th>
                                    <th>Price</th>
                                    <th>EAN</th>
                                    <th>MPN</th>
                                </tr>
                                </thead>
                                <tbody>
                                {products.length === 0 ? (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="scraper-empty">Inga produkter hittades.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    products.map((item, idx) => (
                                        <tr key={item.uid || item.id || `${item.name}-${idx}`}>
                                            <td>{item.siteName || item.site_name || item.site || "—"}</td>
                                            <td title={item.name || ""}>{item.name || "—"}</td>
                                            <td>{formatMoney(item.latest_price || item.price || item.currentPrice || 0)}</td>
                                            <td>{item.ean || "—"}</td>
                                            <td>{item.mpn || "—"}</td>
                                        </tr>
                                    ))
                                )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}