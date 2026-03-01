import { useEffect, useMemo, useRef, useState } from "react";
import PriceHistory from "../charts/PriceHistory";
import PricingPanel from "./PricingPanel";
import { Button } from "../../ui/Button";
import { api } from "../../../lib/api";
import { formatMoney } from "../../../lib/utils";

function normMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

export default function ProductDrawer({ open, onClose, product, fetchJson, onProductUpdate }) {
    const drawerRef = useRef(null);

    const [view, setView] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const source = product?.__source || "";
    const isInventory = source === "db" || !!product?.__dbCompanyId;
    const isScrapedMarket = source === "dbMarket" || !!product?.uid || !!product?.__uid;

    const p = useMemo(() => (open && product ? product : null), [open, product]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        function onDocMouseDown(e) {
            if (!drawerRef.current?.contains(e.target)) onClose?.();
        }

        if (open) {
            window.addEventListener("keydown", onKey);
            document.addEventListener("mousedown", onDocMouseDown);
            document.body.classList.add("drawer-open");
        } else {
            document.body.classList.remove("drawer-open");
        }

        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDocMouseDown);
            document.body.classList.remove("drawer-open");
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !product) {
            setView(null);
            setErr("");
            setLoading(false);
            return;
        }

        let alive = true;
        (async () => {
            setLoading(true);
            setErr("");
            try {
                let v = null;

                if (isScrapedMarket) {
                    const uid = String(product?.uid ?? product?.__uid ?? "").trim();
                    if (!uid) throw new Error("Missing uid for scraped market view");
                    v = await api.fetchDbScrapedProductView(uid);

                    // if backend returns ok:false, surface message
                    if (v && v.ok === false) {
                        throw new Error(v.message || v.error || "Could not load market offers");
                    }
                } else if (isInventory) {
                    const companyId = product?.__dbCompanyId;
                    const ean = product?.ean != null ? String(product.ean) : "";
                    if (companyId) v = await api.fetchDbProductViewByCompany(companyId);
                    else if (ean) v = await api.fetchDbProductViewByEan(ean);
                    else throw new Error("Missing EAN/companyId for inventory view");
                }

                if (!alive) return;
                setView(v);
            } catch (e) {
                if (!alive) return;
                setErr(String(e?.message || e));
                setView(null);
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [open, product, isInventory, isScrapedMarket]);

    const offers = useMemo(() => {
        const o = view?.offers || view?.items || null;
        return Array.isArray(o) ? o : null;
    }, [view]);

    const rollup = view?.rollup || null;

    const marketName =
        rollup?.display_name ||
        view?.display_name ||
        product?.display_name ||
        product?.name ||
        (offers?.[0]?.name ?? "");

    const uid = String(product?.uid ?? product?.__uid ?? rollup?.uid ?? "").trim();

    const recommended =
        view?.recommendedPrice ??
        rollup?.price_median ??
        rollup?.priceMedian ??
        product?.recommendedPrice ??
        null;

    const minP = view?.priceMin ?? rollup?.price_min ?? rollup?.priceMin ?? null;
    const maxP = view?.priceMax ?? rollup?.price_max ?? rollup?.priceMax ?? null;

    const offersCount =
        view?.offersCount ??
        rollup?.offers_count ??
        rollup?.offersCount ??
        (Array.isArray(offers) ? offers.length : null);

    const merged = useMemo(() => {
        if (!p) return null;

        if (isScrapedMarket) {
            return {
                ...p,
                __source: "dbMarket",
                uid,
                name: marketName || uid || "—",
                ean: rollup?.ean ?? p.ean ?? "",
                mpn: rollup?.mpn ?? p.mpn ?? "",

                priceMode: "AUTO",
                manualPrice: null,
                ourPrice: null,

                recommendedPrice: recommended,
                effectivePrice: recommended,

                marketPriceMin: minP,
                marketPriceMax: maxP,
                marketBenchmarkPrice: recommended,
                competitorCount: offersCount,
            };
        }

        // inventory keeps your existing merged approach (PricingPanel needs it)
        const company = view?.company || view?.companyListing || view?.listing || null;
        const market = view?.market || view?.snapshot || view?.marketSnapshot || null;
        const recommendedFromInv = view?.recommendedPrice ?? view?.pricing?.recommendedPrice ?? null;

        return {
            ...p,
            id: company?.id ?? p.id,
            name: company?.name ?? p.name,
            brand: company?.brand ?? p.brand,
            category: company?.category ?? p.category,
            ean: company?.ean ?? p.ean,
            mpn: company?.mpn ?? p.mpn,

            ourPrice: p.ourPrice ?? company?.ourPrice ?? company?.our_price ?? p.price ?? null,
            costPrice: p.costPrice ?? company?.costPrice ?? company?.cost_price ?? null,

            priceMode: p.priceMode ?? company?.priceMode ?? company?.price_mode ?? "AUTO",
            manualPrice: p.manualPrice ?? company?.manualPrice ?? company?.manual_price ?? null,

            recommendedPrice:
                p.recommendedPrice ??
                recommendedFromInv ??
                market?.benchmarkPrice ??
                market?.benchmark_price ??
                null,

            effectivePrice:
                p.effectivePrice ??
                view?.effectivePrice ??
                view?.pricing?.effectivePrice ??
                null,

            marketPriceMin: market?.priceMin ?? market?.price_min ?? p.marketPriceMin ?? null,
            marketPriceMax: market?.priceMax ?? market?.price_max ?? p.marketPriceMax ?? null,
            marketBenchmarkPrice: market?.benchmarkPrice ?? market?.benchmark_price ?? p.marketBenchmarkPrice ?? null,
            competitorCount: market?.offersCount ?? market?.offers_count ?? p.competitorCount ?? null,
        };
    }, [p, isScrapedMarket, uid, marketName, rollup, recommended, minP, maxP, offersCount, view]);

    if (!open || !p || !merged) return null;

    const eanKey = merged?.ean != null ? String(merged.ean) : "";
    const rec = normMoney(merged.recommendedPrice);
    const mn = normMoney(merged.marketPriceMin);
    const mx = normMoney(merged.marketPriceMax);

    return (
        <>
            <div className="drawerOverlay" onClick={onClose} />
            <aside ref={drawerRef} className="drawer">
                <div className="drawerHeader">
                    <div style={{ minWidth: 0 }}>
                        <div className="drawerTitle" title={merged.name}>
                            {merged.name}
                        </div>
                        <div className="drawerSub">
                            {isScrapedMarket ? (
                                <>
                                    {merged.ean ? `EAN: ${merged.ean}` : "EAN: —"}
                                    {merged.mpn ? ` · MPN: ${merged.mpn}` : ""}
                                </>
                            ) : (
                                <>
                                    {merged.brand} · {merged.category}
                                </>
                            )}
                        </div>
                    </div>
                    <Button onClick={onClose} variant="secondary" size="sm">
                        Close
                    </Button>
                </div>

                <div className="drawerContent">
                    <div className="drawerCard">
                        <div className="drawerCardTop">
                            <div>
                                <div className="drawerLabel">{isScrapedMarket ? "UID" : "EAN"}</div>
                                <div className="drawerEan">{isScrapedMarket ? (uid || "—") : (merged.ean || "—")}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div className="drawerLabel">Source</div>
                                <div className="drawerEan">
                                    {isScrapedMarket ? "Market (Scraped)" : "Our Inventory"}
                                </div>
                            </div>
                        </div>
                    </div>

                    {isScrapedMarket ? (
                        <div className="drawerCard" style={{ marginTop: 12 }}>
                            <div className="drawerCardTop">
                                <div>
                                    <div className="drawerLabel">Market</div>
                                    <div className="drawerEan">{loading ? "Loading…" : err ? "Error" : "OK"}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div className="drawerLabel">Offers</div>
                                    <div className="drawerEan">{offersCount ?? (Array.isArray(offers) ? offers.length : "—")}</div>
                                </div>
                            </div>

                            {err ? (
                                <div style={{ marginTop: 8, opacity: 0.9 }}>
                                    <strong style={{ color: "var(--danger)" }}>Error:</strong> {err}
                                </div>
                            ) : null}

                            {!loading && !err ? (
                                <>
                                    <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ opacity: 0.75 }}>Recommended (median)</span>
                                            <span>{rec ? formatMoney(rec) : "—"}</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ opacity: 0.75 }}>Min</span>
                                            <span>{mn ? formatMoney(mn) : "—"}</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ opacity: 0.75 }}>Max</span>
                                            <span>{mx ? formatMoney(mx) : "—"}</span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 12 }}>
                                        <div className="drawerLabel" style={{ marginBottom: 8 }}>
                                            Stores & prices
                                        </div>

                                        {Array.isArray(offers) && offers.length > 0 ? (
                                            <div style={{ display: "grid", gap: 8 }}>
                                                {offers.map((o, idx) => {
                                                    const site = o.site_name ?? o.siteName ?? o.merchant ?? "—";
                                                    const price = normMoney(o.price);
                                                    const url = o.url ? String(o.url) : "";
                                                    return (
                                                        <div
                                                            key={`${site}:${idx}`}
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "space-between",
                                                                gap: 12,
                                                                padding: 10,
                                                                border: "1px solid var(--border)",
                                                                borderRadius: 12,
                                                                background: "var(--card)",
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                    {site}
                                                                </div>
                                                                {url ? (
                                                                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, opacity: 0.8 }}>
                                                                        Open →
                                                                    </a>
                                                                ) : (
                                                                    <div style={{ fontSize: 12, opacity: 0.6 }}>No URL</div>
                                                                )}
                                                            </div>
                                                            <div style={{ fontWeight: 700 }}>
                                                                {price ? formatMoney(price) : "—"}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ opacity: 0.8 }}>No offers found.</div>
                                        )}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}

                    {isInventory ? (
                        <PricingPanel
                            productKey={eanKey}
                            product={merged}
                            onProductPatched={(patch) => {
                                if (!patch) return;
                                onProductUpdate?.({ ...merged, ...patch });
                            }}
                        />
                    ) : null}

                    {eanKey ? <PriceHistory fetchJson={fetchJson} ean={eanKey} title="Price history" /> : null}
                </div>
            </aside>
        </>
    );
}