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
 * Marknadsvärden kan komma från:
 *  - serverState.marketPriceMin / marketPriceMax / marketPrice (rekommenderat)
 *  - eller legacy: product.priceMin / priceMax / price
 */
function marketMedianFrom(merged) {
    if (!merged) return null;

    // Prefer server-provided explicit market fields (stabilt oavsett vy)
    const minS = toNumberOrNull(merged.marketPriceMin);
    const maxS = toNumberOrNull(merged.marketPriceMax);
    const midS = toNumberOrNull(merged.marketPrice);

    if (minS != null && maxS != null && minS > 0 && maxS > 0) return (minS + maxS) / 2;
    if (midS != null && midS > 0) return midS;
    if (minS != null && minS > 0) return minS;
    if (maxS != null && maxS > 0) return maxS;

    // Fallback legacy (kan vara “fel” i Marknad-vy, men bättre än null om server inte stödjer market fields ännu)
    const min = toNumberOrNull(merged.priceMin);
    const max = toNumberOrNull(merged.priceMax);
    if (min != null && max != null && min > 0 && max > 0) return (min + max) / 2;
    if (min != null && min > 0) return min;
    if (max != null && max > 0) return max;

    const p = toNumberOrNull(merged.price);
    if (p != null && p > 0) return p;

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

            // server kan returnera:
            // { priceMode, manualPrice, recommendedPrice, effectivePrice, lastUpdated, marketPriceMin, marketPriceMax, competitorCount, ... }
            onProductPatched?.({
                priceMode: res.priceMode,
                manualPrice: res.manualPrice ?? null,
                recommendedPrice: res.recommendedPrice ?? null,
                effectivePrice: res.effectivePrice ?? null,
                lastUpdated: res.lastUpdated ?? "",

                // valfritt: låt parent få marknadsfält om server skickar dem
                marketPriceMin: res.marketPriceMin ?? undefined,
                marketPriceMax: res.marketPriceMax ?? undefined,
                marketPrice: res.marketPrice ?? undefined,
                competitorCount: res.competitorCount ?? undefined,
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

    // competitor count: prefer server explicit, fallback legacy offersCount
    const competitors = useMemo(() => {
        const cc = toNumberOrNull(merged.competitorCount);
        if (cc != null) return cc;
        const oc = toNumberOrNull(merged.offersCount);
        if (oc != null) return oc;
        return null;
    }, [merged]);

    return (
        <div className="pricing-panel">
            <div className="pricing-panel__header">
                <div>
                    <div className="pricing-panel__title">Aktuellt pris: {formatMoney(effective)}</div>

                    <div className="pricing-panel__badges">
                        <Badge variant={isManual ? "warning" : "success"}>{priceMode}</Badge>

                        <Badge variant="default">Rekommenderat: {formatMoney(merged.recommendedPrice)}</Badge>

                        {marketMedian != null && (
                            <Badge variant="info">
                                Marknad: {formatMoney(marketMedian)}
                                {competitors != null ? <span className="delta"> · {competitors} offers</span> : null}
                                {delta != null && (
                                    <span className="delta">
                    {" "}
                                        ({delta >= 0 ? "+" : ""}
                                        {formatMoney(delta).replace(" kr", "")} kr)
                  </span>
                                )}
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="pricing-panel__actions">
                    <Button onClick={onRecompute} loading={saving} variant="secondary" size="sm">
                        Räkna om
                    </Button>

                    {!isManual ? (
                        <Button onClick={() => onSwitchMode("MANUAL")} loading={saving} variant="ghost" size="sm">
                            Växla till MANUAL
                        </Button>
                    ) : (
                        <Button onClick={() => onSwitchMode("AUTO")} loading={saving} variant="ghost" size="sm">
                            Växla till AUTO
                        </Button>
                    )}

                    <Button onClick={() => refresh({ recompute: false })} loading={saving} variant="ghost" size="sm">
                        Uppdatera
                    </Button>
                </div>
            </div>

            <div className="pricing-panel__manual">
                <label className="pricing-panel__label">Sätt manuellt pris</label>
                <div className="pricing-panel__input-group">
                    <Input
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="t.ex. 199.90"
                        disabled={saving}
                        style={{ width: 160 }}
                    />
                    <Button onClick={onSaveManual} loading={saving} variant="primary" size="sm">
                        Spara
                    </Button>
                </div>

                {merged?.lastUpdated ? <span className="pricing-panel__meta">Senast uppdaterad: {merged.lastUpdated}</span> : null}
            </div>

            {loading && <div className="pricing-panel__meta">Laddar prissättning…</div>}
            {err && <div className="pricing-panel__error">{err}</div>}
        </div>
    );
}
