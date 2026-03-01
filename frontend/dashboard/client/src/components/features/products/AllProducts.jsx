import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ProductDrawer from "./ProductDrawer";
import ProductThumb from "./ProductThumb";
import PriceModeBadge from "./PriceModeBadge";
import { api } from "../../../lib/api";
import { useDebounce } from "../../../hooks/useDebounce";
import { formatMoney, cn } from "../../../lib/utils";

const PAGE_SIZE = 200;

function rowKeyFor(source, p) {
    if (!p) return "unknown";
    if (source === "company") {
        // DB inventory
        return `db:company:${p.__dbCompanyId ?? p.id ?? p.ean ?? p.company_sku ?? p.companySku ?? "unknown"}`;
    }
    // DB scraped market
    return `db:market:${p.uid ?? p.__uid ?? p.ean ?? p.mpn ?? p.id ?? "unknown"}`;
}

function normalizeDbCompanyRow(p) {
    // company_listings row keys may be snake_case from jdbc query
    const id = p?.id;
    return {
        ...p,
        id,
        __source: "db",
        __dbCompanyId: id ?? null,

        name: p?.name ?? p?.display_name ?? "—",
        brand: p?.brand ?? "—",
        category: p?.category ?? "—",
        ean: p?.ean ?? "",
        mpn: p?.mpn ?? "",

        priceMode: (p?.price_mode ?? p?.priceMode ?? "AUTO")?.toUpperCase?.() ?? "AUTO",
        manualPrice: p?.manual_price ?? p?.manualPrice ?? null,
        ourPrice: p?.our_price ?? p?.ourPrice ?? null,

        __rowKey: rowKeyFor("company", p),
    };
}

function normalizeDbScrapedMarketRow(p) {
    // scraped_market_rollup columns: uid, display_name, ean, mpn, offers_count, price_min, price_max, price_median, last_scraped
    const uid = p?.uid ?? p?.__uid ?? "";
    const offersCount = p?.offers_count ?? p?.offersCount ?? null;
    const priceMedian = p?.price_median ?? p?.priceMedian ?? null;
    const priceMin = p?.price_min ?? p?.priceMin ?? null;
    const priceMax = p?.price_max ?? p?.priceMax ?? null;

    return {
        ...p,
        uid,
        __uid: uid,
        __source: "dbMarket",

        // UI expects these fields
        name: p?.display_name ?? p?.name ?? uid ?? "—",
        brand: "—",
        category: "—",
        ean: p?.ean ?? "",
        mpn: p?.mpn ?? "",

        // For PricingPanel / drawer math
        recommendedPrice: priceMedian,
        effectivePrice: priceMedian, // market items are "AUTO-like" by definition
        marketPriceMin: priceMin,
        marketPriceMax: priceMax,
        marketBenchmarkPrice: priceMedian,
        competitorCount: offersCount,

        __rowKey: rowKeyFor("market", { uid, ean: p?.ean, mpn: p?.mpn }),
    };
}

export default function AllProducts({ source: initialSource = "market" }) {
    // "market" => DB scraped market
    // "company" => DB company listings
    const [source, setSource] = useState(initialSource);

    const [q, setQ] = useState("");
    const debouncedQ = useDebounce(q, 300);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [selected, setSelected] = useState(null);

    // Cursor paging (DB)
    const [afterId, setAfterId] = useState(0);
    const [afterUid, setAfterUid] = useState("");
    const [hasMore, setHasMore] = useState(true);

    // IMPORTANT: overrides keyed by stable __rowKey
    const [overrides, setOverrides] = useState(new Map());

    const parentRef = useRef(null);

    const resetPaging = useCallback(() => {
        setRows([]);
        setHasMore(true);
        setAfterId(0);
        setAfterUid("");
    }, []);

    const fetchFirstPage = useCallback(async () => {
        setLoading(true);
        setErr("");
        try {
            if (source === "company") {
                const res = await api.fetchDbCompanyListings({
                    q: debouncedQ,
                    afterId: 0,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeDbCompanyRow);

                setRows(normalized);
                setAfterId(Number(res?.nextAfterId ?? 0));
                setHasMore(items.length >= PAGE_SIZE && Number(res?.nextAfterId ?? 0) > 0);
            } else {
                const res = await api.fetchDbScrapedMarket({
                    q: debouncedQ,
                    afterUid: "",
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeDbScrapedMarketRow);

                setRows(normalized);
                const next = String(res?.nextAfterUid ?? "");
                setAfterUid(next);
                setHasMore(items.length >= PAGE_SIZE && next !== "");
            }
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [source, debouncedQ]);

    const fetchMore = useCallback(async () => {
        if (loading || !hasMore) return;

        setLoading(true);
        setErr("");
        try {
            if (source === "company") {
                const res = await api.fetchDbCompanyListings({
                    q: debouncedQ,
                    afterId,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeDbCompanyRow);

                setRows((prev) => [...prev, ...normalized]);

                const next = Number(res?.nextAfterId ?? afterId);
                setAfterId(next);

                // If endpoint returns same cursor or too few items -> no more
                setHasMore(items.length >= PAGE_SIZE && next > afterId);
            } else {
                const res = await api.fetchDbScrapedMarket({
                    q: debouncedQ,
                    afterUid,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeDbScrapedMarketRow);

                setRows((prev) => [...prev, ...normalized]);

                const next = String(res?.nextAfterUid ?? afterUid);
                setAfterUid(next);
                setHasMore(items.length >= PAGE_SIZE && next !== afterUid && next !== "");
            }
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [loading, hasMore, source, debouncedQ, afterId, afterUid]);

    // Reset + fetch when source/search changes
    useEffect(() => {
        resetPaging();
        fetchFirstPage();
    }, [source, debouncedQ, resetPaging, fetchFirstPage]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 8,
    });

    // Auto-load more near bottom
    useEffect(() => {
        const items = rowVirtualizer.getVirtualItems();
        const last = items[items.length - 1];
        if (!last) return;

        if (last.index >= rows.length - 12 && !loading && hasMore) {
            fetchMore();
        }
    }, [rowVirtualizer.getVirtualItems(), rows.length, loading, hasMore, fetchMore]);

    const applyOverride = (updatedProduct) => {
        if (!updatedProduct) return;

        const key =
            updatedProduct.__rowKey ||
            selected?.__rowKey ||
            rowKeyFor(source, updatedProduct);

        if (!key) return;

        setOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(key), updatedProduct);
            return next;
        });

        setSelected((prev) => (prev ? { ...prev, ...updatedProduct } : null));

        setRows((prev) =>
            prev.map((r) => (String(r.__rowKey) === String(key) ? { ...r, ...updatedProduct } : r))
        );
    };

    const getEffectivePrice = (p) => {
        const key = p.__rowKey || rowKeyFor(source, p);
        const override = overrides.get(String(key));
        const product = override ? { ...p, ...override } : p;

        const mode = String(product.priceMode ?? "AUTO").toUpperCase();
        if (mode === "MANUAL" && product.manualPrice != null) return product.manualPrice;

        return (
            product.effectivePrice ??
            product.recommendedPrice ??
            product.ourPrice ??
            product.price ??
            null
        );
    };

    const headerCountText = useMemo(() => {
        if (loading && rows.length === 0) return "Loading…";
        return `${rows.length.toLocaleString("sv-SE")}${hasMore ? "+" : ""}`;
    }, [rows.length, hasMore, loading]);

    return (
        <div>
            <div className="row" style={{ marginBottom: 16 }}>
                <div className="segmented">
                    <button
                        className={cn("segBtn", source === "market" && "segBtnActive")}
                        onClick={() => setSource("market")}
                        title="Konkurrentdata (scraped) i DB"
                    >
                        Marknad
                    </button>
                    <button
                        className={cn("segBtn", source === "company" && "segBtnActive")}
                        onClick={() => setSource("company")}
                        title="Vårt lager (company_listings) i DB"
                    >
                        Vårt lager
                    </button>
                </div>

                <div className="actions">
                    <input
                        className="input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök EAN / MPN / namn…"
                        style={{ width: 320 }}
                    />
                    <span className="badge">{headerCountText}</span>
                </div>
            </div>

            {err && (
                <div className="card" style={{ marginBottom: 16, borderColor: "var(--danger)" }}>
                    <div className="card-pad" style={{ color: "var(--danger)" }}>
                        Fel: {err}
                    </div>
                </div>
            )}

            <div ref={parentRef} className="virtualWrap" style={{ height: 600 }}>
                <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const p = rows[virtualRow.index];
                        if (!p) return null;

                        const price = getEffectivePrice(p);
                        const offersCount =
                            source === "market"
                                ? (p.competitorCount ?? p.offers_count ?? p.offersCount ?? null)
                                : null;

                        return (
                            <div
                                key={p.__rowKey || p.id || p.uid || p.ean}
                                className="virtualRow"
                                onClick={() => setSelected(p)}
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <div className="virtualLeft">
                                    <ProductThumb src={p.imageUrl} alt={p.name} />
                                    <div className="virtualTexts">
                                        <div className="virtualTitle">{p.name}</div>
                                        <div className="virtualMeta">
                                            {source === "market" ? (
                                                <>
                                                    {p.ean ? `EAN: ${p.ean}` : p.mpn ? `MPN: ${p.mpn}` : "—"}
                                                    {p.mpn && p.ean ? ` · MPN: ${p.mpn}` : null}
                                                </>
                                            ) : (
                                                <>
                                                    {p.brand} · {p.category} · {p.ean}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="virtualRight">
                                    {source === "company" && (
                                        <PriceModeBadge priceMode={p.priceMode} manualPrice={p.manualPrice} />
                                    )}

                                    {source === "market" && offersCount != null ? (
                                        <span className="badge">{offersCount} offers</span>
                                    ) : null}

                                    <span className="virtualPrice">{price != null ? formatMoney(price) : "—"}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {loading && (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
                        Loading...
                    </div>
                )}
            </div>

            <ProductDrawer
                open={!!selected}
                onClose={() => setSelected(null)}
                product={selected}
                fetchJson={api.request.bind(api)}
                onProductUpdate={applyOverride}
            />
        </div>
    );
}