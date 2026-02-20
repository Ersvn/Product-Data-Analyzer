import { useState, useCallback, useEffect, useRef } from "react";
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

const PAGE_SIZE = 100;

/* ================= ICON ================= */
const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

/* ================= PAGE ================= */
export default function ProductsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [source, setSource] = useState(searchParams.get("source") || "market");
    const [q, setQ] = useState(searchParams.get("q") || "");
    const debouncedQ = useDebounce(q, 300);

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [selected, setSelected] = useState(null);
    const [overrides, setOverrides] = useState(new Map());

    // Fix: setCreateOpen existed but state didn't
    const [createOpen, setCreateOpen] = useState(false);

    // Bulk recompute UI state
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkMsg, setBulkMsg] = useState("");

    const listRef = useRef(null);

    /* ================= URL SYNC ================= */
    useEffect(() => {
        const params = new URLSearchParams();
        if (source !== "market") params.set("source", source);
        if (q) params.set("q", q);
        setSearchParams(params, { replace: true });
    }, [source, q, setSearchParams]);

    /* ================= FETCH ================= */
    const fetchData = useCallback(
        async (pageNum, append = false) => {
            setLoading(true);
            setErr("");

            try {
                const endpoint = source === "company" ? "fetchCompanyProducts" : "fetchProducts";

                const res = await api[endpoint]({
                    q: debouncedQ,
                    page: pageNum,
                    limit: PAGE_SIZE,
                });

                const newData = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

                const newMeta = res?.meta || {
                    total: res?.total || 0,
                    page: pageNum,
                    totalPages: Math.ceil((res?.total || 0) / PAGE_SIZE),
                };

                setRows((prev) => (append ? [...prev, ...newData] : newData));
                setMeta(newMeta);
            } catch (e) {
                setErr(String(e?.message || e));
            } finally {
                setLoading(false);
            }
        },
        [source, debouncedQ]
    );

    /* ================= RESET ================= */
    useEffect(() => {
        setPage(1);
        setRows([]);
        fetchData(1, false);
    }, [source, debouncedQ, fetchData]);

    /* ================= LOAD MORE ================= */
    const loadMore = useCallback(() => {
        if (page < meta.totalPages && !loading) {
            const next = page + 1;
            setPage(next);
            fetchData(next, true);
        }
    }, [page, meta.totalPages, loading, fetchData]);

    /* ================= INFINITE SCROLL ================= */
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;

        const onScroll = () => {
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
            if (bottom) loadMore();
        };

        el.addEventListener("scroll", onScroll);
        return () => el.removeEventListener("scroll", onScroll);
    }, [loadMore]);

    /* ================= EXPORT ================= */
    const handleExport = () => {
        const data = rows.map((r) => ({
            Namn: r.name,
            EAN: r.ean,
            Brand: r.brand,
            Kategori: r.category,
            Pris: r.price || r.ourPrice,
            Butik: r.store,
            Läge: r.priceMode || "AUTO",
        }));

        downloadCSV(data, `produkter-${source}-${new Date().toISOString().split("T")[0]}.csv`);
    };

    /* ================= OVERRIDE ================= */
    const applyOverride = (updated) => {
        if (!updated?.id) return;
        const key = String(updated.id);

        // overrides-map (för effective price i listan)
        setOverrides((prev) => new Map(prev).set(key, updated));

        // uppdatera selected (drawer)
        setSelected((prev) => (prev ? { ...prev, ...updated } : null));

        // uppdatera rows direkt (så du slipper F5)
        setRows((prev) => prev.map((r) => (String(r.id) === key ? { ...r, ...updated } : r)));
    };

    /* ================= PRICE ================= */
    const getEffectivePrice = (p) => {
        const override = overrides.get(String(p.id));
        const product = override ? { ...p, ...override } : p;

        const serverEff = Number(product.effectivePrice);
        if (Number.isFinite(serverEff) && serverEff > 0) return serverEff;

        if (product.priceMode === "MANUAL" && product.manualPrice != null) return product.manualPrice;

        return product.recommendedPrice || product.ourPrice || product.price;
    };

    /* ================= BULK RECOMPUTE ================= */
    const handleBulkRecompute = useCallback(async () => {
        setBulkMsg("");
        setErr("");

        setBulkLoading(true);
        try {
            const res = await api.recomputeAllPricing({ persist: true });
            const msg = `Klart: ${res?.recomputed ?? 0} omräknade, ${res?.skipped ?? 0} hoppade över, ${res?.errors ?? 0} fel (${res?.tookMs ?? 0} ms)`;
            setBulkMsg(msg);

            // Clear overrides because server values are now updated
            setOverrides(new Map());

            // Reload list so you see updated recommended/effective right away
            setPage(1);
            await fetchData(1, false);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBulkLoading(false);
        }
    }, [fetchData]);

    /* ================= RENDER ================= */
    return (
        <section className="apage">
            {/* HEADER */}
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Katalog</div>
                    <h1 className="apage__title">Produkter</h1>
                    <p className="apage__sub">Sök, granska och justera prissättning</p>
                </div>

                <div className="apage__actions">
                    <Button variant="ghost" onClick={handleExport} disabled={!rows.length}>
                        Exportera CSV
                    </Button>

                    {/* Bulk button only makes sense on "Vårt lager" */}
                    {source === "company" && (
                        <Button
                            variant="secondary"
                            onClick={handleBulkRecompute}
                            disabled={bulkLoading || loading}
                            title="Räknar om rekommenderat pris för alla produkter i ditt lager"
                        >
                            {bulkLoading ? "Uppdaterar…" : "Uppdatera alla priser"}
                        </Button>
                    )}

                    <Button onClick={() => setCreateOpen(true)}>Ny produkt</Button>
                </div>
            </header>

            {/* FILTER BAR */}
            <div className="apage__toolbar">
                <div className="segmented">
                    <button className={cn("segBtn", source === "market" && "segBtnActive")} onClick={() => setSource("market")}>
                        Marknad
                    </button>

                    <button className={cn("segBtn", source === "company" && "segBtnActive")} onClick={() => setSource("company")}>
                        Vårt lager
                    </button>
                </div>

                <div className="apage__tools">
                    <Badge>
                        Visar: {rows.length.toLocaleString("sv-SE")} / {meta.total.toLocaleString("sv-SE")}
                    </Badge>

                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök produkter..."
                        icon={<SearchIcon />}
                        className="productsSearch"
                    />
                </div>
            </div>

            {/* BULK MESSAGE */}
            {bulkMsg ? (
                <div style={{ padding: "8px 12px", margin: "10px 0", borderRadius: 12 }} className="panel">
                    <strong>Bulk:</strong> {bulkMsg}
                </div>
            ) : null}

            {/* ERROR */}
            {err && <ErrorState error={{ message: err }} retry={() => fetchData(1)} />}

            {/* LIST */}
            <div ref={listRef} className={cn("virtualWrap", selected && "virtualWrap--with-drawer")}>
                {rows.map((p) => {
                    const price = getEffectivePrice(p);

                    return (
                        <div key={p.id || p.ean} className="virtualRow" onClick={() => setSelected(p)}>
                            <div className="virtualLeft">
                                <ProductThumb src={p.imageUrl} alt={p.name} />
                                <div className="virtualTexts">
                                    <div className="virtualTitle">{p.name}</div>
                                    <div className="virtualMeta">
                                        {p.brand} · {p.category} · {p.ean}
                                    </div>
                                </div>
                            </div>

                            <div className="virtualRight">
                                {source === "company" && <PriceModeBadge priceMode={p.priceMode} manualPrice={p.manualPrice} />}

                                <span className="virtualPrice">{formatMoney(price)}</span>

                                {p.store && <Badge size="sm">{p.store}</Badge>}
                            </div>
                        </div>
                    );
                })}

                {/* LOADER */}
                {loading && (
                    <div style={{ padding: 20 }}>
                        <Skeleton height={60} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                    </div>
                )}

                {/* END INDICATOR */}
                {!loading && page >= meta.totalPages && rows.length > 0 && <div className="listEnd">Inga fler produkter</div>}
            </div>

            {/* DRAWER */}
            <ProductDrawer
                open={!!selected}
                onClose={() => setSelected(null)}
                product={selected}
                fetchJson={api.request.bind(api)}
                onProductUpdate={applyOverride}
            />

            {/* CREATE PLACEHOLDER (så din state inte är död kod) */}
            {createOpen ? (
                <div style={{ padding: 12, marginTop: 12, borderRadius: 12 }} className="panel">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <strong>Ny produkt (TODO)</strong>
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                            Stäng
                        </Button>
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.85 }}>
                        Detta är en placeholder så appen inte kraschar. Vi kan bygga en riktig “drool-worthy” create modal sen.
                    </div>
                </div>
            ) : null}
        </section>
    );
}