import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";
import { ErrorState } from "../components/ui/ErrorState";
import { Badge } from "../components/ui/Badge";
import ProductDrawer from "../components/features/products/ProductDrawer";
import ProductThumb from "../components/features/products/ProductThumb";
import PriceModeBadge from "../components/features/products/PriceModeBadge";
import { formatMoney, cn, downloadCSV } from "../lib/utils";
import {
    rowKeyFor,
    normalizeInventoryRow,
    normalizeMarketRow,
    isMatchedInventoryProduct,
    isMatchedMarketRow,
    getEffectivePrice,
    filterAndSortRows,
} from "./products/productsPageAdapters";

const PAGE_SIZE = 50;

const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

export default function ProductsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const initialSource = searchParams.get("source") === "market" ? "market" : "inventory";

    const [source, setSource] = useState(initialSource);
    const [q, setQ] = useState(searchParams.get("q") || "");
    const debouncedQ = useDebounce(q, 300);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [selected, setSelected] = useState(null);
    const [bulkBusy, setBulkBusy] = useState(false);

    const listRef = useRef(null);
    const inFlightRef = useRef(false);
    const hasMoreRef = useRef(true);
    const afterIdRef = useRef(0);
    const afterUidRef = useRef("");

    useEffect(() => {
        const params = new URLSearchParams();
        if (source !== "inventory") params.set("source", source);
        if (q) params.set("q", q);
        setSearchParams(params, { replace: true });
    }, [source, q, setSearchParams]);

    const resetListState = useCallback(() => {
        setRows([]);
        setErr("");
        setSelected(null);
        afterIdRef.current = 0;
        afterUidRef.current = "";
        hasMoreRef.current = true;
    }, []);

    const fetchInventoryPage = useCallback(
        async (append) => {
            const afterId = append ? afterIdRef.current : 0;

            const res = await api.fetchDbCompanyListings({
                q: debouncedQ,
                afterId,
                limit: PAGE_SIZE,
            });

            const items = Array.isArray(res?.items) ? res.items.map(normalizeInventoryRow) : [];
            const nextAfterId = Number(res?.nextAfterId ?? 0);

            setRows((prev) => (append ? [...prev, ...items] : items));
            afterIdRef.current = nextAfterId;
            hasMoreRef.current = items.length === PAGE_SIZE && nextAfterId > 0;
        },
        [debouncedQ]
    );

    const fetchMarketPage = useCallback(
        async (append) => {
            const afterUid = append ? afterUidRef.current : "";

            const res = await api.fetchDbScrapedMarket({
                q: debouncedQ,
                afterUid,
                limit: PAGE_SIZE,
            });

            const items = Array.isArray(res?.items) ? res.items.map(normalizeMarketRow) : [];
            const nextAfterUid = String(res?.nextAfterUid ?? "");

            setRows((prev) => (append ? [...prev, ...items] : items));
            afterUidRef.current = nextAfterUid;
            hasMoreRef.current = items.length === PAGE_SIZE && nextAfterUid !== "";
        },
        [debouncedQ]
    );

    const fetchPage = useCallback(
        async ({ append }) => {
            if (inFlightRef.current) return;

            inFlightRef.current = true;
            setLoading(true);
            setErr("");

            try {
                if (source === "inventory") {
                    await fetchInventoryPage(append);
                } else {
                    await fetchMarketPage(append);
                }
            } catch (e) {
                setErr(String(e?.message || e));
            } finally {
                setLoading(false);
                inFlightRef.current = false;
            }
        },
        [source, fetchInventoryPage, fetchMarketPage]
    );

    const fetchFirstPage = useCallback(async () => {
        afterIdRef.current = 0;
        afterUidRef.current = "";
        hasMoreRef.current = true;
        await fetchPage({ append: false });
    }, [fetchPage]);

    const fetchMore = useCallback(async () => {
        if (loading || inFlightRef.current || !hasMoreRef.current) return;
        await fetchPage({ append: true });
    }, [fetchPage, loading]);

    const handleRecomputeAll = useCallback(async () => {
        if (source !== "inventory") return;

        setBulkBusy(true);
        setErr("");

        try {
            const res = await api.recomputeAllDbAuto();
            await fetchFirstPage();
            alert(`Recompute klart. Updated: ${res?.updated ?? 0} / ${res?.candidates ?? 0}`);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBulkBusy(false);
        }
    }, [source, fetchFirstPage]);

    useEffect(() => {
        resetListState();
        fetchFirstPage();
    }, [source, debouncedQ, resetListState, fetchFirstPage]);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;

        const onScroll = () => {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
            const canScroll = el.scrollHeight > el.clientHeight + 10;
            if (nearBottom && canScroll) fetchMore();
        };

        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, [fetchMore]);

    const applyUpdateToRows = useCallback(
        (updated) => {
            if (!updated) return;

            const key = updated.__rowKey || selected?.__rowKey || rowKeyFor(source, updated);

            setSelected((prev) => (prev ? { ...prev, ...updated, __rowKey: key } : null));

            setRows((prev) =>
                prev.map((row) =>
                    String(row.__rowKey) === String(key)
                        ? { ...row, ...updated, __rowKey: key }
                        : row
                )
            );
        },
        [selected, source]
    );

    const displayRows = useMemo(() => {
        return filterAndSortRows(rows, source, debouncedQ);
    }, [rows, source, debouncedQ]);

    const checkIsMatched = useCallback((product, currentSource) => {
        return currentSource === "inventory"
            ? isMatchedInventoryProduct(product)
            : isMatchedMarketRow(product);
    }, []);

    const handleExport = useCallback(() => {
        const data = displayRows.map((row) => ({
            Namn: row.name,
            EAN: row.ean ?? "",
            MPN: row.mpn ?? "",
            Pris: getEffectivePrice(row) ?? "",
            Offers: row.competitorCount ?? "",
            Läge: row.priceMode ?? "AUTO",
            Källa: source,
            UID: row.uid ?? "",
            Status: checkIsMatched(row, source)
                ? (source === "inventory" ? "Matched" : "Matched to inventory")
                : (source === "inventory" ? "Inventory only" : "Unmatched market row"),
            InventoryMatches: row.inventoryMatchCount ?? "",
        }));

        downloadCSV(data, `produkter-${source}-${new Date().toISOString().split("T")[0]}.csv`);
    }, [displayRows, source, checkIsMatched]);

    const loadedBadge = useMemo(
        () => `Loaded: ${displayRows.length.toLocaleString("sv-SE")}${hasMoreRef.current ? "+" : ""}`,
        [displayRows.length]
    );

    const matchedCount = useMemo(() => {
        return displayRows.filter(row => checkIsMatched(row, source)).length;
    }, [displayRows, source, checkIsMatched]);

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Catalog</div>
                    <h1 className="apage__title">Products</h1>
                    <p className="apage__sub">
                        Browse your inventory and compare it with scraped market data.
                    </p>
                </div>

                <div className="apage__actions">
                    {source === "inventory" ? (
                        <Button onClick={handleRecomputeAll} disabled={bulkBusy}>
                            {bulkBusy ? "Recomputing..." : "Recompute All Auto"}
                        </Button>
                    ) : null}

                    <Button variant="ghost" onClick={handleExport} disabled={!displayRows.length}>
                        Export CSV
                    </Button>
                </div>
            </header>

            <div className="apage__toolbar">
                <div className="segmented">
                    <button
                        className={cn("segBtn", source === "inventory" && "segBtnActive")}
                        onClick={() => setSource("inventory")}
                    >
                        Our Inventory
                    </button>

                    <button
                        className={cn("segBtn", source === "market" && "segBtnActive")}
                        onClick={() => setSource("market")}
                    >
                        Market
                    </button>
                </div>

                <div className="apage__tools">
                    <Badge>{loadedBadge}</Badge>
                    <Badge>{matchedCount} matched</Badge>

                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={
                            source === "inventory"
                                ? 'Look up EAN / MPN / Name… or write "matched" / "unmatched"'
                                : 'Look up EAN / MPN / Name… or write "matched" / "unmatched"'
                        }
                        icon={<SearchIcon />}
                    />
                </div>
            </div>

            {err ? <ErrorState error={{ message: err }} retry={fetchFirstPage} /> : null}

            <div ref={listRef} className={cn("virtualWrap", selected && "virtualWrap--with-drawer")}>
                {displayRows.map((product) => {
                    const price = getEffectivePrice(product);
                    const offers = product.competitorCount ?? null;
                    const isMatched = checkIsMatched(product, source);
                    return (
                        <div
                            key={product.__rowKey || product.id || product.uid || product.ean}
                            className="virtualRow"
                            onClick={() => setSelected(product)}
                        >
                            <div className="virtualLeft">
                                <ProductThumb src={product.imageUrl} alt={product.name} />

                                <div className="virtualTexts">
                                    <div
                                        className="virtualTitle"
                                        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                                    >
                                        <span>{product.name}</span>

                                        {source === "inventory" ? (
                                            isMatched ? (
                                                <Badge variant="success">Matched</Badge>
                                            ) : (
                                                <Badge variant="muted">Inventory only</Badge>
                                            )
                                        ) : isMatched ? (
                                            <Badge variant="success">
                                                Matched{product.inventoryMatchCount > 1 ? ` (${product.inventoryMatchCount})` : ""}
                                            </Badge>
                                        ) : (
                                            <Badge variant="muted">Unmatched</Badge>
                                        )}
                                    </div>

                                    <div className="virtualMeta">
                                        {[
                                            product.ean ? `EAN: ${product.ean}` : null,
                                            product.mpn ? `MPN: ${product.mpn}` : null,
                                            product.brand ? product.brand : null,
                                            !product.ean && !product.mpn && product.uid ? `UID: ${product.uid}` : null,
                                        ].filter(Boolean).join(" · ") || "—"}
                                    </div>

                                </div>
                            </div>

                            <div className="virtualRight">
                                {source === "inventory" ? (
                                    <PriceModeBadge priceMode={product.priceMode} manualPrice={product.manualPrice} />
                                ) : offers != null ? (
                                    <span className="badge">{offers} offers</span>
                                ) : null}

                                <span className="virtualPrice">
                                    {price != null ? formatMoney(price) : "—"}
                                </span>
                            </div>
                        </div>
                    );
                })}

                {loading ? (
                    <div style={{ padding: 20 }}>
                        <Skeleton height={60} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                    </div>
                ) : null}

                {!loading && !hasMoreRef.current && displayRows.length > 0 ? (
                    <div className="listEnd">Inga fler produkter</div>
                ) : null}
            </div>

            <ProductDrawer
                open={!!selected}
                onClose={() => setSelected(null)}
                product={selected}
                onProductUpdate={applyUpdateToRows}
            />
        </section>
    );
}