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
    const s = String(raw ?? "").trim().replace(/[\s\u00A0]/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function effectivePriceFrom(p) {
    if (!p) return null;

    const eff = toNumberOrNull(p.effectivePrice);
    if (eff != null && eff > 0) return eff;

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

export default function PricingPanel({ productKey, product, onProductPatched }) {
    const { addToast } = useToast();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [serverState, setServerState] = useState(null);
    const [manualInput, setManualInput] = useState("");

    const isDb =
        product?.__source === "db" ||
        product?.__source === "dbMarket" ||
        !!product?.__dbCompanyId;

    const merged = useMemo(() => ({ ...(product || {}), ...(serverState || {}) }), [product, serverState]);

    const priceMode = String(merged.priceMode ?? "AUTO").toUpperCase();
    const isManual = priceMode === "MANUAL";

    const effective = useMemo(() => effectivePriceFrom(merged), [merged]);

    const patchParent = useCallback(
        (patch) => {
            if (!patch) return;
            onProductPatched?.(patch);
        },
        [onProductPatched]
    );

    const refreshDb = useCallback(async () => {
        if (!productKey) return null;

        setErr("");
        setLoading(true);
        try {
            const companyId = product?.__dbCompanyId;

            const view = companyId
                ? await api.fetchDbProductViewByCompany(companyId)
                : await api.fetchDbProductViewByEan(productKey);

            const company = view?.company ?? view?.companyListing ?? view?.listing ?? null;
            const snap = view?.snapshot ?? view?.market ?? view?.marketSnapshot ?? null;

            const recommended =
                toNumberOrNull(view?.recommendedPrice) ??
                toNumberOrNull(view?.pricing?.recommendedPrice) ??
                null;

            const effectiveFromServer =
                toNumberOrNull(view?.effectivePrice) ??
                toNumberOrNull(view?.pricing?.effectivePrice) ??
                null;

            const patch = {
                priceMode: company?.price_mode ?? company?.priceMode ?? "AUTO",
                manualPrice: company?.manual_price ?? company?.manualPrice ?? null,

                ourPrice: toNumberOrNull(company?.our_price ?? company?.ourPrice) ?? null,

                marketPriceMin: snap?.price_min ?? snap?.priceMin,
                marketPriceMax: snap?.price_max ?? snap?.priceMax,
                marketBenchmarkPrice: snap?.benchmark_price ?? snap?.benchmarkPrice,
                competitorCount: snap?.offers_count ?? snap?.offersCount,

                recommendedPrice: recommended,
                effectivePrice: effectiveFromServer,
            };

            setServerState(patch);
            setManualInput(patch.manualPrice != null ? String(patch.manualPrice) : "");
            return patch;
        } catch (e) {
            setErr(e?.message || "Kunde inte ladda DB-prissättning");
            return null;
        } finally {
            setLoading(false);
        }
    }, [productKey, product]);

    const refreshLegacy = useCallback(
        async ({ recompute = true } = {}) => {
            setErr("");
            setLoading(true);
            try {
                const res = await api.fetchPricing(productKey, { recompute });
                setServerState(res || null);
                const mp = res?.manualPrice ?? product?.manualPrice;
                setManualInput(mp != null ? String(mp) : "");
            } catch (e) {
                setErr(e?.message || "Kunde inte ladda prissättning");
            } finally {
                setLoading(false);
            }
        },
        [productKey, product?.manualPrice]
    );

    useEffect(() => {
        if (!productKey) {
            setErr("Saknar EAN – kan inte ladda prissättning.");
            return;
        }
        if (isDb) refreshDb();
        else refreshLegacy({ recompute: true });
    }, [productKey, isDb, refreshDb, refreshLegacy]);

    const onSaveManual = useCallback(async () => {
        setErr("");
        const num = parseMoneyInput(manualInput);
        if (num == null || num <= 0) {
            setErr("Manuellt pris måste vara ett positivt nummer");
            return;
        }

        setSaving(true);
        try {
            if (isDb) {
                const companyId = product?.__dbCompanyId;
                if (!companyId) {
                    setErr("Saknar companyId – kan inte spara MANUAL i DB.");
                    return;
                }

                await api.patchDbCompanyListing(companyId, {
                    priceMode: "MANUAL",
                    manualPrice: num,
                });

                addToast("Manuellt pris sparat (DB)", "success");

                const patch = await refreshDb();
                if (patch) patchParent(patch);
            } else {
                const res = await api.updateManualPrice(productKey, num);
                setServerState(res || null);
                setManualInput(res?.manualPrice != null ? String(res.manualPrice) : String(num));

                patchParent({
                    priceMode: res?.priceMode,
                    manualPrice: res?.manualPrice ?? num,
                    recommendedPrice: res?.recommendedPrice ?? null,
                    effectivePrice: res?.effectivePrice ?? null,
                });
                addToast("Manuellt pris sparat", "success");
            }
        } catch (e) {
            setErr(e?.message || "Kunde inte spara");
            addToast("Kunde inte spara pris", "error");
        } finally {
            setSaving(false);
        }
    }, [manualInput, productKey, isDb, product, refreshDb, patchParent, addToast]);

    const onSwitchMode = useCallback(
        async (mode) => {
            setErr("");
            setSaving(true);
            try {
                if (isDb) {
                    const companyId = product?.__dbCompanyId;
                    if (!companyId) {
                        setErr("Saknar companyId – kan inte växla läge i DB.");
                        return;
                    }

                    const payload = { priceMode: mode };

                    if (mode === "MANUAL") {
                        const fromInput = parseMoneyInput(manualInput);
                        const fallback =
                            effectivePriceFrom(merged) ??
                            toNumberOrNull(merged.recommendedPrice) ??
                            toNumberOrNull(merged.marketBenchmarkPrice) ??
                            toNumberOrNull(merged.ourPrice) ??
                            null;

                        const manual =
                            fromInput != null && fromInput > 0
                                ? fromInput
                                : fallback != null && fallback > 0
                                    ? fallback
                                    : null;

                        if (manual == null) {
                            setErr("Skriv ett manuellt pris först innan du växlar till MANUAL.");
                            return;
                        }

                        payload.manualPrice = manual;
                        setManualInput(String(manual));
                    }

                    await api.patchDbCompanyListing(companyId, payload);
                    addToast(`Växlade till ${mode}-läge (DB)`, "success");

                    const patch = await refreshDb();
                    if (patch) patchParent(patch);
                } else {
                    const res = await api.updatePricingMode(productKey, mode);
                    setServerState(res || null);
                    if (mode === "AUTO") setManualInput("");

                    patchParent({
                        priceMode: res?.priceMode,
                        manualPrice: res?.manualPrice ?? null,
                        recommendedPrice: res?.recommendedPrice ?? null,
                        effectivePrice: res?.effectivePrice ?? null,
                    });
                    addToast(`Växlade till ${mode}-läge`, "success");
                }
            } catch (e) {
                setErr(e?.message || "Kunde inte växla läge");
                addToast("Kunde inte växla läge", "error");
            } finally {
                setSaving(false);
            }
        },
        [isDb, product, productKey, refreshDb, patchParent, addToast, manualInput, merged]
    );

    const onRecompute = useCallback(async () => {
        setErr("");
        setSaving(true);
        try {
            if (isDb) {
                const mode = String(merged.priceMode ?? "AUTO").toUpperCase();
                const companyId = product?.__dbCompanyId;

                // In DB mode, recompute should update stored our_price when AUTO
                if (mode === "AUTO" && companyId) {
                    const res = await api.applyDbAutoPrice(companyId);

                    const rp = toNumberOrNull(res?.recommendedPrice);
                    const ep = toNumberOrNull(res?.effectivePrice);
                    const our = toNumberOrNull(res?.ourPrice);

                    const optimistic = {
                        recommendedPrice: rp ?? merged.recommendedPrice ?? null,
                        effectivePrice: ep ?? rp ?? merged.effectivePrice ?? null,
                        ourPrice: our ?? merged.ourPrice ?? null,
                    };

                    setServerState((prev) => ({ ...(prev || {}), ...optimistic }));
                    patchParent(optimistic);
                }

                const patch = await refreshDb();
                if (patch) patchParent(patch);

                addToast("Pris uppdaterat (DB)", "success");
            } else {
                const res = await api.recomputePricing(productKey);
                setServerState(res || null);
                patchParent(res);
                addToast("Pris omräknat", "success");
            }
        } catch (e) {
            setErr(e?.message || "Kunde inte räkna om");
            addToast("Kunde inte räkna om pris", "error");
        } finally {
            setSaving(false);
        }
    }, [isDb, refreshDb, productKey, patchParent, addToast, merged, product]);

    const competitors = useMemo(() => {
        const cc = toNumberOrNull(merged.competitorCount);
        return cc != null ? cc : null;
    }, [merged]);

    const spreadMin = toNumberOrNull(merged.marketPriceMin);
    const spreadMax = toNumberOrNull(merged.marketPriceMax);
    const hasSpread =
        spreadMin != null && spreadMax != null && spreadMin > 0 && spreadMax > 0;

    return (
        <div className="pricing-panel">
            <div className="pricing-panel__header">
                <div>
                    <div className="pricing-panel__title">
                        Current price: {formatMoney(effective)}
                    </div>

                    <div className="pricing-panel__badges">
                        <Badge variant={isManual ? "warning" : "success"}>{priceMode}</Badge>

                        {competitors != null ? (
                            <Badge variant="muted">{competitors} offers</Badge>
                        ) : null}

                        {hasSpread ? (
                            <Badge variant="default">
                                Spread: {formatMoney(spreadMin)} – {formatMoney(spreadMax)}
                            </Badge>
                        ) : null}

                        {loading ? <Badge variant="muted">Loading…</Badge> : null}
                    </div>

                    {err ? <div className="pricing-panel__error">{err}</div> : null}
                </div>

                <div className="pricing-panel__actions">
                    <Button disabled={saving || loading} onClick={onRecompute} variant="secondary">
                        Recompute
                    </Button>

                    {isManual ? (
                        <Button disabled={saving || loading} onClick={() => onSwitchMode("AUTO")} variant="secondary">
                            Change to AUTO
                        </Button>
                    ) : (
                        <Button disabled={saving || loading} onClick={() => onSwitchMode("MANUAL")} variant="secondary">
                            Change to MANUAL
                        </Button>
                    )}
                </div>
            </div>

            <div className="pricing-panel__body">
                <div className="pricing-panel__row">
                    <div className="pricing-panel__label">Manual price</div>
                    <div className="pricing-panel__field">
                        <Input
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="t.ex. 199"
                            disabled={!isManual || saving || loading}
                        />
                        <Button onClick={onSaveManual} disabled={!isManual || saving || loading} variant="primary">
                            Save
                        </Button>
                    </div>
                </div>

                <div className="pricing-panel__meta">
                    <div>
                        EAN: <strong>{productKey}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}