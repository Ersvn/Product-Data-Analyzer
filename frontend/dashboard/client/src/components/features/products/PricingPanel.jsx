import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api.js";
import { formatMoney } from "../../../lib/utils";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Badge } from "../../ui/Badge";
import { useToast } from "../../../hooks/useToast";

function toNumberOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseMoneyInput(raw) {
    const s = String(raw ?? "")
        .trim()
        .replace(/[\s\u00A0]/g, "")
        .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Marknadsvärden SKA komma från serverState:
 * - marketBenchmarkPrice (canonical)
 * - eller marketPrice (alias/back-compat)
 * - samt marketPriceMin/marketPriceMax/competitorCount om du vill visa mer info
 *
 * Viktigt: vi gissar INTE marknad från product.priceMin/priceMax/price
 * eftersom "product" i lager-vyn representerar dina egna inventory-fält.
 */
function marketMedianFrom(merged) {
    if (!merged) return null;

    const bench = toNumberOrNull(merged.marketBenchmarkPrice);
    if (bench != null && bench > 0) return bench;

    const mid = toNumberOrNull(merged.marketPrice); // back-compat alias
    if (mid != null && mid > 0) return mid;

    // Optional: om server bara skickar min/max utan benchmark, räkna median
    const minS = toNumberOrNull(merged.marketPriceMin);
    const maxS = toNumberOrNull(merged.marketPriceMax);
    if (minS != null && maxS != null && minS > 0 && maxS > 0) return (minS + maxS) / 2;
    if (minS != null && minS > 0) return minS;
    if (maxS != null && maxS > 0) return maxS;

    return null;
}

// samma prioritet som ProductsPage
function effectivePriceFrom(p) {
    if (!p) return null;
    const mode = String(p.priceMode ?? "AUTO").toUpperCase();
    const manual = toNumberOrNull(p.manualPrice);
    if (mode === "MANUAL" && manual != null && manual > 0) return manual;

    const rec = toNumberOrNull(p.recommendedPrice);
    if (rec != null && rec > 0) return rec;

    const our = toNumberOrNull(p.ourPrice);
    if (our != null && our > 0) return our;

    const price = toNumberOrNull(p.price);
    if (price != null && price > 0) return price;

    return null;
}

function unwrap(res) {
    if (!res) return null;
    if (res.product && typeof res.product === "object") return res.product;
    if (res.data && typeof res.data === "object") return res.data;
    return res;
}

export default function PricingPanel({ productKey, product, onProductPatched }) {
    const { addToast } = useToast();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [serverState, setServerState] = useState(null);
    const [manualInput, setManualInput] = useState("");

    // view = product (från listan) + senaste serverState
    const merged = useMemo(() => ({ ...(product || {}), ...(serverState || {}) }), [product, serverState]);

    const priceMode = String(merged.priceMode ?? "AUTO").toUpperCase();
    const isManual = priceMode === "MANUAL";

    const marketMedian = useMemo(() => marketMedianFrom(merged), [merged]);
    const effective = useMemo(() => effectivePriceFrom(merged), [merged]);

    const delta = useMemo(() => {
        if (marketMedian == null || effective == null) return null;
        return effective - marketMedian;
    }, [marketMedian, effective]);

    const patchParent = useCallback(
        (res) => {
            if (!res) return;

            onProductPatched?.({
                priceMode: res.priceMode,
                manualPrice: res.manualPrice ?? null,
                recommendedPrice: res.recommendedPrice ?? null,
                effectivePrice: res.effectivePrice ?? null,
                lastUpdated: res.lastUpdated ?? "",

                // market snapshot (optional but useful)
                marketPriceMin: res.marketPriceMin ?? undefined,
                marketPriceMax: res.marketPriceMax ?? undefined,
                marketBenchmarkPrice: res.marketBenchmarkPrice ?? undefined,
                marketPrice: res.marketPrice ?? undefined, // alias/back-compat
                competitorCount: res.competitorCount ?? undefined,
                marketLastUpdated: res.marketLastUpdated ?? undefined,

                gapKr: res.gapKr ?? undefined,
                gapPct: res.gapPct ?? undefined,
            });
        },
        [onProductPatched]
    );

    const refresh = useCallback(
        async ({ recompute = true } = {}) => {
            if (!productKey) return;
            setErr("");
            setLoading(true);
            try {
                const res = unwrap(await api.fetchPricing(productKey, { recompute }));
                setServerState(res || null);

                const mp = res?.manualPrice ?? product?.manualPrice;
                setManualInput(mp != null ? String(mp) : "");
            } catch (e) {
                setErr(e?.message || "Kunde inte ladda prissättning");
            } finally {
                setLoading(false);
            }
        },
        [productKey] // eslint-disable-line react-hooks/exhaustive-deps
    );

    useEffect(() => {
        if (!productKey) {
            setErr("Saknar EAN – kan inte ladda prissättning.");
            return;
        }
        refresh({ recompute: true });
    }, [productKey, refresh]);

    const onSaveManual = useCallback(async () => {
        setErr("");
        const num = parseMoneyInput(manualInput);
        if (num == null || num <= 0) {
            setErr("Manuellt pris måste vara ett positivt nummer");
            return;
        }

        setSaving(true);
        try {
            const res = unwrap(await api.updateManualPrice(productKey, num));
            setServerState(res || null);
            setManualInput(res?.manualPrice != null ? String(res.manualPrice) : String(num));
            patchParent(res);
            addToast("Manuellt pris sparat", "success");
        } catch (e) {
            setErr(e?.message || "Kunde inte spara");
            addToast("Kunde inte spara pris", "error");
        } finally {
            setSaving(false);
        }
    }, [manualInput, productKey, patchParent, addToast]);

    const onSwitchMode = useCallback(
        async (mode) => {
            setErr("");
            setSaving(true);
            try {
                const res = unwrap(await api.updatePricingMode(productKey, mode));
                setServerState(res || null);
                if (mode === "AUTO") setManualInput("");
                patchParent(res);
                addToast(`Växlade till ${mode}-läge`, "success");
            } catch (e) {
                setErr(e?.message || "Kunde inte växla läge");
                addToast("Kunde inte växla läge", "error");
            } finally {
                setSaving(false);
            }
        },
        [productKey, patchParent, addToast]
    );

    const onRecompute = useCallback(async () => {
        setErr("");
        setSaving(true);
        try {
            const res = unwrap(await api.recomputePricing(productKey));
            setServerState(res || null);
            patchParent(res);
            addToast("Pris omräknat", "success");
        } catch (e) {
            setErr(e?.message || "Kunde inte räkna om");
            addToast("Kunde inte räkna om pris", "error");
        } finally {
            setSaving(false);
        }
    }, [productKey, patchParent, addToast]);

    // competitor count: prefer server explicit
    const competitors = useMemo(() => {
        const cc = toNumberOrNull(merged.competitorCount);
        if (cc != null) return cc;
        return null;
    }, [merged]);

    // Optional: gap from server if present (else compute)
    const gapKr = useMemo(() => {
        const g = toNumberOrNull(merged.gapKr);
        if (g != null) return g;
        if (delta != null) return delta;
        return null;
    }, [merged, delta]);

    const gapPct = useMemo(() => {
        const gp = toNumberOrNull(merged.gapPct);
        if (gp != null) return gp;
        if (gapKr == null || marketMedian == null || marketMedian <= 0) return null;
        return gapKr / marketMedian;
    }, [merged, gapKr, marketMedian]);

    return (
        <div className="pricing-panel">
            <div className="pricing-panel__header">
                <div>
                    <div className="pricing-panel__title">Aktuellt pris: {formatMoney(effective)}</div>

                    <div className="pricing-panel__badges">
                        <Badge variant={isManual ? "warning" : "success"}>{priceMode}</Badge>

                        <Badge variant="default">Rekommenderat: {formatMoney(merged.recommendedPrice)}</Badge>

                        {marketMedian != null ? (
                            <Badge variant="info">
                                Marknad: {formatMoney(marketMedian)}
                                {competitors != null ? <span className="delta"> · {competitors} offers</span> : null}
                                {gapKr != null ? (
                                    <span className="delta">
                    {" "}
                                        ({gapKr >= 0 ? "+" : ""}
                                        {formatMoney(gapKr)}
                                        {gapPct != null ? ` · ${(gapPct * 100).toFixed(1)}%` : ""})
                  </span>
                                ) : null}
                            </Badge>
                        ) : (
                            <Badge variant="muted">Marknad: saknas</Badge>
                        )}

                        {loading ? <Badge variant="muted">Laddar…</Badge> : null}
                    </div>

                    {err ? <div className="pricing-panel__error">{err}</div> : null}
                </div>

                <div className="pricing-panel__actions">
                    <Button disabled={saving || loading} onClick={onRecompute} variant="secondary">
                        Räkna om
                    </Button>

                    {isManual ? (
                        <Button disabled={saving || loading} onClick={() => onSwitchMode("AUTO")} variant="secondary">
                            Byt till AUTO
                        </Button>
                    ) : (
                        <Button disabled={saving || loading} onClick={() => onSwitchMode("MANUAL")} variant="secondary">
                            Byt till MANUAL
                        </Button>
                    )}
                </div>
            </div>

            <div className="pricing-panel__body">
                <div className="pricing-panel__row">
                    <div className="pricing-panel__label">Manuellt pris</div>
                    <div className="pricing-panel__field">
                        <Input
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="t.ex. 199"
                            disabled={!isManual || saving || loading}
                        />
                        <Button onClick={onSaveManual} disabled={!isManual || saving || loading} variant="primary">
                            Spara
                        </Button>
                    </div>
                </div>

                <div className="pricing-panel__meta">
                    <div>EAN: <strong>{productKey}</strong></div>
                    {merged.lastUpdated ? <div>Last updated: {merged.lastUpdated}</div> : null}
                    {merged.marketLastUpdated ? <div>Market updated: {merged.marketLastUpdated}</div> : null}
                </div>
            </div>
        </div>
    );
}
