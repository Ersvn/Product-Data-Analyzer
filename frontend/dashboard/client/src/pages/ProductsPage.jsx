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

const PAGE_SIZE = 200;

const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
    </svg>
);

function rowKeyFor(source, p) {
    if (!p) return "unknown";
    if (source === "inventory") return `inv:${p.__companyId ?? p.id ?? p.ean ?? "unknown"}`;
    return `mkt:${p.uid ?? p.__uid ?? p.ean ?? p.mpn ?? "unknown"}`;
}

function normalizeInventoryRow(r) {
    const id = r?.id ?? null;

    const out = {
        id,
        __companyId: id,
        __source: "db", // ProductDrawer/PricingPanel för inventory är byggda för db-source
        __dbCompanyId: id,

        name: r?.name ?? "",
        brand: r?.brand ?? "",
        category: r?.category ?? "",
        ean: r?.ean ?? null,
        mpn: r?.mpn ?? null,

        ourPrice: r?.our_price ?? r?.ourPrice ?? null,
        costPrice: r?.cost_price ?? r?.costPrice ?? null,
        priceMode: (r?.price_mode ?? r?.priceMode ?? "AUTO")?.toUpperCase?.() ?? "AUTO",
        manualPrice: r?.manual_price ?? r?.manualPrice ?? null,

        imageUrl: r?.image_url ?? r?.imageUrl ?? null,
        url: r?.url ?? null,
    };

    return { ...out, __rowKey: rowKeyFor("inventory", out) };
}

function normalizeMarketRow(r) {
    // scraped_market_rollup: uid, display_name, ean, mpn, offers_count, price_min, price_max, price_median, last_scraped
    const uid = String(r?.uid ?? "").trim();

    const out = {
        uid,
        __uid: uid,
        __source: "dbMarket", // ProductDrawer för scraped market använder dbMarket och uid

        name: r?.display_name ?? r?.name ?? uid ?? "",
        ean: r?.ean ?? null,
        mpn: r?.mpn ?? null,

        // “recommended” = median
        recommendedPrice: r?.price_median ?? r?.priceMedian ?? null,
        effectivePrice: r?.price_median ?? r?.priceMedian ?? null,

        marketPriceMin: r?.price_min ?? r?.priceMin ?? null,
        marketPriceMax: r?.price_max ?? r?.priceMax ?? null,
        marketBenchmarkPrice: r?.price_median ?? r?.priceMedian ?? null,
        competitorCount: r?.offers_count ?? r?.offersCount ?? null,

        lastScraped: r?.last_scraped ?? r?.lastScraped ?? null,
    };

    return { ...out, __rowKey: rowKeyFor("market", out) };
}

export default function ProductsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    // inventory | market
    const [source, setSource] = useState(searchParams.get("source") || "inventory");
    const [q, setQ] = useState(searchParams.get("q") || "");
    const debouncedQ = useDebounce(q, 300);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [selected, setSelected] = useState(null);

    // keyset paging
    const afterIdRef = useRef(0);
    const afterUidRef = useRef("");
    const hasMoreRef = useRef(true);

    // prevent overlapping requests
    const inFlightRef = useRef(false);

    // overrides keyed by __rowKey
    const [overrides, setOverrides] = useState(new Map());

    const listRef = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams();
        if (source !== "market") params.set("source", source);
        if (q) params.set("q", q);
        setSearchParams(params, { replace: true });
    }, [source, q, setSearchParams]);

    const reset = useCallback(() => {
        setRows([]);
        setErr("");
        setSelected(null);
        setOverrides(new Map());
        afterIdRef.current = 0;
        afterUidRef.current = "";
        hasMoreRef.current = true;
    }, []);

    const fetchFirstPage = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;

        setLoading(true);
        setErr("");

        try {
            afterIdRef.current = 0;
            afterUidRef.current = "";
            hasMoreRef.current = true;

            if (source === "inventory") {
                const res = await api.fetchDbCompanyListings({
                    q: debouncedQ,
                    afterId: 0,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeInventoryRow);

                setRows(normalized);

                const nextAfterId = Number(res?.nextAfterId ?? 0);
                afterIdRef.current = nextAfterId;
                hasMoreRef.current = items.length === PAGE_SIZE && nextAfterId > 0;
            } else {
                const res = await api.fetchDbScrapedMarket({
                    q: debouncedQ,
                    afterUid: "",
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeMarketRow);

                setRows(normalized);

                const next = String(res?.nextAfterUid ?? "");
                afterUidRef.current = next;
                hasMoreRef.current = items.length === PAGE_SIZE && next !== "";
            }
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
            inFlightRef.current = false;
        }
    }, [source, debouncedQ]);

    const fetchMore = useCallback(async () => {
        if (loading) return;
        if (inFlightRef.current) return;
        if (!hasMoreRef.current) return;

        inFlightRef.current = true;
        setLoading(true);
        setErr("");

        try {
            if (source === "inventory") {
                const res = await api.fetchDbCompanyListings({
                    q: debouncedQ,
                    afterId: afterIdRef.current,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeInventoryRow);

                setRows((prev) => [...prev, ...normalized]);

                const nextAfterId = Number(res?.nextAfterId ?? afterIdRef.current);
                hasMoreRef.current = items.length === PAGE_SIZE && nextAfterId > afterIdRef.current;
                afterIdRef.current = nextAfterId;
            } else {
                const res = await api.fetchDbScrapedMarket({
                    q: debouncedQ,
                    afterUid: afterUidRef.current,
                    limit: PAGE_SIZE,
                });

                const items = Array.isArray(res?.items) ? res.items : [];
                const normalized = items.map(normalizeMarketRow);

                setRows((prev) => [...prev, ...normalized]);

                const next = String(res?.nextAfterUid ?? afterUidRef.current);
                hasMoreRef.current = items.length === PAGE_SIZE && next !== "" && next !== afterUidRef.current;
                afterUidRef.current = next;
            }
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
            inFlightRef.current = false;
        }
    }, [source, debouncedQ, loading]);

    useEffect(() => {
        reset();
        fetchFirstPage();
    }, [source, debouncedQ, reset, fetchFirstPage]);

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

    const applyOverride = (updated) => {
        if (!updated) return;

        const key = updated.__rowKey || selected?.__rowKey || rowKeyFor(source, updated);
        if (!key) return;

        setOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(key), updated);
            return next;
        });

        setSelected((prev) => (prev ? { ...prev, ...updated, __rowKey: key } : null));

        setRows((prev) =>
            prev.map((r) => (String(r.__rowKey) === String(key) ? { ...r, ...updated, __rowKey: key } : r))
        );
    };

    const getEffectivePrice = (p) => {
        const key = p.__rowKey || rowKeyFor(source, p);
        const override = overrides.get(String(key));
        const product = override ? { ...p, ...override } : p;

        const eff = Number(product.effectivePrice);
        if (Number.isFinite(eff) && eff > 0) return eff;

        const mode = String(product.priceMode ?? "AUTO").toUpperCase();
        if (mode === "MANUAL" && product.manualPrice != null) return product.manualPrice;

        const rec = Number(product.recommendedPrice);
        if (Number.isFinite(rec) && rec > 0) return rec;

        const our = Number(product.ourPrice);
        if (Number.isFinite(our) && our > 0) return our;

        const price = Number(product.price);
        if (Number.isFinite(price) && price > 0) return price;

        return null;
    };

    const handleExport = () => {
        const data = rows.map((r) => ({
            Namn: r.name,
            EAN: r.ean ?? "",
            MPN: r.mpn ?? "",
            Pris: getEffectivePrice(r) ?? "",
            Offers: r.competitorCount ?? "",
            Läge: r.priceMode ?? "AUTO",
            Källa: source,
            UID: r.uid ?? "",
        }));
        downloadCSV(data, `produkter-${source}-${new Date().toISOString().split("T")[0]}.csv`);
    };

    const loadedBadge = useMemo(() => {
        return `Loaded: ${rows.length.toLocaleString("sv-SE")}${hasMoreRef.current ? "+" : ""}`;
    }, [rows.length]);

    const showModeBadge = source === "inventory";

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Catalog</div>
                    <h1 className="apage__title">Products</h1>
                    <p className="apage__sub">Search, compare and adjust prices</p>
                </div>

                <div className="apage__actions">
                    <Button variant="ghost" onClick={handleExport} disabled={!rows.length}>
                        Exportera CSV
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

                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök EAN / MPN / namn…"
                        icon={<SearchIcon />}
                    />
                </div>
            </div>

            {err && <ErrorState error={{ message: err }} retry={fetchFirstPage} />}

            <div ref={listRef} className={cn("virtualWrap", selected && "virtualWrap--with-drawer")}>
                {rows.map((p) => {
                    const price = getEffectivePrice(p);
                    const offers = p.competitorCount ?? null;

                    return (
                        <div key={p.__rowKey || p.id || p.uid || p.ean} className="virtualRow" onClick={() => setSelected(p)}>
                            <div className="virtualLeft">
                                <ProductThumb src={p.imageUrl} alt={p.name} />
                                <div className="virtualTexts">
                                    <div className="virtualTitle">{p.name}</div>

                                    {source === "market" ? (
                                        <div className="virtualMeta">
                                            {p.ean ? `EAN: ${p.ean}` : p.mpn ? `MPN: ${p.mpn}` : `UID: ${p.uid ?? "—"}`}
                                            {p.mpn && p.ean ? ` · MPN: ${p.mpn}` : null}
                                        </div>
                                    ) : (
                                        <div className="virtualMeta">
                                            {p.brand} · {p.category} · {p.ean}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="virtualRight">
                                {showModeBadge ? <PriceModeBadge priceMode={p.priceMode} manualPrice={p.manualPrice} /> : null}
                                {source === "market" && offers != null ? <span className="badge">{offers} offers</span> : null}
                                <span className="virtualPrice">{price != null ? formatMoney(price) : "—"}</span>
                            </div>
                        </div>
                    );
                })}

                {loading && (
                    <div style={{ padding: 20 }}>
                        <Skeleton height={60} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                        <Skeleton height={60} style={{ marginTop: 8 }} />
                    </div>
                )}

                {!loading && !hasMoreRef.current && rows.length > 0 ? <div className="listEnd">Inga fler produkter</div> : null}
            </div>

            <ProductDrawer
                open={!!selected}
                onClose={() => setSelected(null)}
                product={selected}
                fetchJson={api.request.bind(api)}
                onProductUpdate={applyOverride}
            />
        </section>
    );
}