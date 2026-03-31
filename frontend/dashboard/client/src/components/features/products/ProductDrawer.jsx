import { useEffect, useMemo, useRef, useState } from "react";
import PricingPanel from "./PricingPanel";
import { Button } from "../../ui/Button";
import { api } from "../../../lib/api";
import { formatMoney } from "../../../lib/utils";

function normMoney(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ProductDrawer({ open, onClose, product, onProductUpdate }) {
    const ref = useRef(null);

    const [view, setView] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const p = open ? product : null;
    const isInventory = p?.__source === "db" || !!p?.__dbCompanyId;
    const isMarket = p?.__source === "dbMarket" || !!p?.uid || !!p?.__uid;

    useEffect(() => {
        if (!open) {
            document.body.classList.remove("drawer-open");
            return;
        }

        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }

        function onMouseDown(e) {
            if (!ref.current?.contains(e.target)) onClose?.();
        }

        window.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onMouseDown);
        document.body.classList.add("drawer-open");

        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onMouseDown);
            document.body.classList.remove("drawer-open");
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !p) {
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
                let res = null;

                if (isMarket) {
                    const uid = String(p?.uid ?? p?.__uid ?? "").trim();
                    if (!uid) throw new Error("Missing uid");
                    res = await api.fetchDbScrapedProductView(uid);
                } else if (isInventory) {
                    const companyId = p?.__dbCompanyId;
                    const ean = p?.ean != null ? String(p.ean) : "";

                    if (companyId) {
                        res = await api.fetchDbProductViewByCompany(companyId);
                    } else if (ean) {
                        res = await api.fetchDbProductViewByEan(ean);
                    } else {
                        throw new Error("Missing id/ean");
                    }
                }

                if (!alive) return;
                if (res?.ok === false) throw new Error(res.message || res.error || "Failed to load product view");

                setView(res);
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
    }, [open, p, isInventory, isMarket]);

    const offers = Array.isArray(view?.offers) ? view.offers : [];
    const rollup = view?.rollup || {};
    const snapshot = view?.snapshot || {};
    const company = view?.company || {};
    const display = view?.display || {};

    const merged = useMemo(() => {
        if (!p) return null;

        if (isMarket) {
            return {
                ...p,
                uid: p?.uid ?? p?.__uid ?? rollup?.uid ?? "",
                name: display?.name ?? rollup?.display_name ?? p?.name ?? "—",
                ean: rollup?.ean ?? p?.ean ?? "",
                mpn: rollup?.mpn ?? p?.mpn ?? "",
                recommendedPrice: view?.recommendedPrice ?? rollup?.price_median ?? p?.recommendedPrice ?? null,
                marketPriceMin: view?.priceMin ?? snapshot?.price_min ?? rollup?.price_min ?? null,
                marketPriceMax: view?.priceMax ?? snapshot?.price_max ?? rollup?.price_max ?? null,
                competitorCount: view?.offersCount ?? snapshot?.offers_count ?? rollup?.offers_count ?? offers.length,
                priceMode: "AUTO",
                manualPrice: null,
                ourPrice: null,
            };
        }

        return {
            ...p,
            __dbCompanyId: p?.__dbCompanyId ?? company?.id ?? p?.id,
            name: display?.name ?? company?.name ?? p?.name ?? "—",
            brand: company?.brand ?? p?.brand ?? "",
            category: company?.category ?? p?.category ?? "",
            ean: display?.ean ?? company?.ean ?? p?.ean ?? "",
            mpn: display?.mpn ?? company?.mpn ?? p?.mpn ?? "",
            ourPrice: company?.our_price ?? company?.ourPrice ?? p?.ourPrice ?? null,
            costPrice: company?.cost_price ?? company?.costPrice ?? p?.costPrice ?? null,
            priceMode: company?.price_mode ?? company?.priceMode ?? p?.priceMode ?? "AUTO",
            manualPrice: company?.manual_price ?? company?.manualPrice ?? p?.manualPrice ?? null,
            recommendedPrice: view?.recommendedPrice ?? null,
            marketPriceMin: snapshot?.price_min ?? null,
            marketPriceMax: snapshot?.price_max ?? null,
            competitorCount: snapshot?.offers_count ?? offers.length,
        };
    }, [p, isMarket, rollup, snapshot, company, display, view, offers.length]);

    if (!open || !p || !merged) return null;

    const productKey = isMarket
        ? String(merged?.uid ?? "")
        : String(merged?.ean ?? "");

    const recommended = normMoney(merged?.recommendedPrice);
    const minPrice = normMoney(merged?.marketPriceMin);
    const maxPrice = normMoney(merged?.marketPriceMax);

    return (
        <>
            <div className="drawerOverlay" onClick={onClose} />

            <aside ref={ref} className="drawer">
                <div className="drawerHeader">
                    <div style={{ minWidth: 0 }}>
                        <div className="drawerTitle" title={merged.name}>
                            {merged.name}
                        </div>

                        <div className="drawerSub">
                            {merged.brand || merged.category ? (
                                <>
                                    {merged.brand || "—"}
                                    {merged.category ? ` · ${merged.category}` : ""}
                                </>
                            ) : (
                                <>
                                    {merged.ean ? `EAN: ${merged.ean}` : "EAN: —"}
                                    {merged.mpn ? ` · MPN: ${merged.mpn}` : ""}
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
                                <div className="drawerLabel">{isMarket ? "UID" : "EAN"}</div>
                                <div className="drawerEan">{productKey || "—"}</div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <div className="drawerLabel">Source</div>
                                <div className="drawerEan">
                                    {isMarket ? "Market (Scraped)" : "Our Inventory"}
                                </div>
                            </div>
                        </div>
                    </div>

                    {err ? (
                        <div className="drawerCard" style={{ marginTop: 12 }}>
                            <strong style={{ color: "var(--danger)" }}>Error:</strong> {err}
                        </div>
                    ) : null}

                    {isInventory ? (
                        <PricingPanel
                            productKey={String(merged?.ean ?? "")}
                            product={merged}
                            initialView={view}
                            onProductPatched={(patch) => {
                                if (!patch) return;
                                onProductUpdate?.({ ...merged, ...patch });
                            }}
                        />
                    ) : null}

                    <div className="drawerCard" style={{ marginTop: 12 }}>
                        <div className="drawerCardTop">
                            <div>
                                <div className="drawerLabel">Market</div>
                                <div className="drawerEan">{loading ? "Loading…" : "OK"}</div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <div className="drawerLabel">Offers</div>
                                <div className="drawerEan">{merged.competitorCount ?? offers.length ?? "—"}</div>
                            </div>
                        </div>

                        {!loading ? (
                            <>
                                <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ opacity: 0.75 }}>Recommended</span>
                                        <span>{recommended ? formatMoney(recommended) : "—"}</span>
                                    </div>

                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ opacity: 0.75 }}>Min</span>
                                        <span>{minPrice ? formatMoney(minPrice) : "—"}</span>
                                    </div>

                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ opacity: 0.75 }}>Max</span>
                                        <span>{maxPrice ? formatMoney(maxPrice) : "—"}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: 12 }}>
                                    <div className="drawerLabel" style={{ marginBottom: 8 }}>
                                        Stores & prices
                                    </div>

                                    {offers.length > 0 ? (
                                        <div style={{ display: "grid", gap: 8 }}>
                                            {offers.map((offer, idx) => {
                                                const site =
                                                    offer?.site_name ??
                                                    offer?.siteName ??
                                                    offer?.merchant ??
                                                    "—";

                                                const url = offer?.url ? String(offer.url) : "";
                                                const price = normMoney(offer?.price);

                                                return (
                                                    <div
                                                        key={`${site}:${idx}`}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 12,
                                                            padding: 10,
                                                            border: "1px solid var(--glass-border)",
                                                            borderRadius: 12,
                                                            background: "var(--surface)",
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0 }}>
                                                            <div
                                                                style={{
                                                                    fontWeight: 650,
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                }}
                                                            >
                                                                {site}
                                                            </div>

                                                            {url ? (
                                                                <a
                                                                    href={url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    style={{ fontSize: 12, opacity: 0.8 }}
                                                                >
                                                                    Open →
                                                                </a>
                                                            ) : (
                                                                <div style={{ fontSize: 12, opacity: 0.6 }}>
                                                                    No URL
                                                                </div>
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
                </div>
            </aside>
        </>
    );
}