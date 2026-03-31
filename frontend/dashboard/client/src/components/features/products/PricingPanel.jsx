import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api.js";
import { formatMoney } from "../../../lib/utils";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Badge } from "../../ui/Badge";

function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseMoney(value) {
    const n = Number(
        String(value ?? "")
            .trim()
            .replace(/[\s\u00A0]/g, "")
            .replace(",", ".")
    );
    return Number.isFinite(n) ? n : null;
}

function getEffectivePrice(product) {
    if (!product) return null;

    const effective = toNumber(product.effectivePrice);
    if (effective != null && effective > 0) return effective;

    const manual = toNumber(product.manualPrice);
    if (String(product.priceMode ?? "AUTO").toUpperCase() === "MANUAL" && manual != null && manual > 0) {
        return manual;
    }

    const our = toNumber(product.ourPrice);
    if (our != null && our > 0) return our;

    const recommended = toNumber(product.recommendedPrice);
    if (recommended != null && recommended > 0) return recommended;

    const price = toNumber(product.price);
    if (price != null && price > 0) return price;

    return null;
}

function patchFromView(view) {
    const company = view?.company ?? {};
    const snapshot = view?.snapshot ?? {};

    return {
        priceMode: company?.price_mode ?? company?.priceMode ?? "AUTO",
        manualPrice: company?.manual_price ?? company?.manualPrice ?? null,
        ourPrice: toNumber(company?.our_price ?? company?.ourPrice),
        costPrice: toNumber(company?.cost_price ?? company?.costPrice),
        recommendedPrice: toNumber(view?.recommendedPrice),
        marketPriceMin: snapshot?.price_min ?? null,
        marketPriceMax: snapshot?.price_max ?? null,
        marketBenchmarkPrice: snapshot?.benchmark_price ?? null,
        competitorCount: snapshot?.offers_count ?? null,
    };
}

function patchFromItem(item) {
    return {
        id: item?.id ?? null,
        priceMode: item?.price_mode ?? item?.priceMode ?? "AUTO",
        manualPrice: item?.manual_price ?? item?.manualPrice ?? null,
        ourPrice: toNumber(item?.our_price ?? item?.ourPrice),
        costPrice: toNumber(item?.cost_price ?? item?.costPrice),
    };
}

export default function PricingPanel({ productKey, product, initialView = null, onProductPatched }) {
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");
    const [serverPatch, setServerPatch] = useState(null);
    const [manualInput, setManualInput] = useState("");

    const merged = useMemo(
        () => ({ ...(product || {}), ...(serverPatch || {}) }),
        [product, serverPatch]
    );

    const priceMode = String(merged.priceMode ?? "AUTO").toUpperCase();
    const isManual = priceMode === "MANUAL";
    const effective = useMemo(() => getEffectivePrice(merged), [merged]);

    const applyPatch = useCallback(
        (patch) => {
            if (!patch) return;
            setServerPatch((prev) => ({ ...(prev || {}), ...patch }));
            onProductPatched?.(patch);
        },
        [onProductPatched]
    );

    const refreshDb = useCallback(async () => {
        const companyId = product?.__dbCompanyId;
        if (!companyId) {
            setErr("Saknar companyId – kan inte uppdatera från DB.");
            return null;
        }

        try {
            const view = await api.fetchDbProductViewByCompany(companyId);
            const patch = patchFromView(view);
            setServerPatch((prev) => ({ ...(prev || {}), ...patch }));
            setManualInput(patch.manualPrice != null ? String(patch.manualPrice) : "");
            return patch;
        } catch (e) {
            setErr(e?.message || "Kunde inte ladda DB-prissättning");
            return null;
        }
    }, [product]);

    useEffect(() => {
        if (!productKey || !initialView) return;
        const patch = patchFromView(initialView);
        setServerPatch(patch);
        setManualInput(patch.manualPrice != null ? String(patch.manualPrice) : "");
    }, [productKey, initialView]);

    const onSaveManual = useCallback(async () => {
        const companyId = product?.__dbCompanyId;
        const manualPrice = parseMoney(manualInput);

        setErr("");
        setInfo("");

        if (!companyId) {
            setErr("Saknar companyId – kan inte spara MANUAL i DB.");
            return;
        }

        if (manualPrice == null || manualPrice <= 0) {
            setErr("Manuellt pris måste vara ett positivt nummer.");
            return;
        }

        setSaving(true);
        try {
            const res = await api.patchDbCompanyListing(companyId, {
                priceMode: "MANUAL",
                manualPrice,
            });

            const itemPatch = patchFromItem(res?.item ?? {});
            applyPatch(itemPatch);
            setManualInput(String(manualPrice));
            setInfo("Manuellt pris sparat.");

            await refreshDb();
        } catch (e) {
            setErr(e?.message || "Kunde inte spara.");
        } finally {
            setSaving(false);
        }
    }, [manualInput, product, applyPatch, refreshDb]);

    const onSwitchMode = useCallback(
        async (mode) => {
            const companyId = product?.__dbCompanyId;
            setErr("");
            setInfo("");

            if (!companyId) {
                setErr("Saknar companyId – kan inte växla läge i DB.");
                return;
            }

            const payload = { priceMode: mode };

            if (mode === "MANUAL") {
                const fromInput = parseMoney(manualInput);
                const fallback =
                    fromInput ??
                    getEffectivePrice(merged) ??
                    toNumber(merged.recommendedPrice) ??
                    toNumber(merged.marketBenchmarkPrice) ??
                    toNumber(merged.ourPrice);

                if (fallback == null || fallback <= 0) {
                    setErr("Skriv ett manuellt pris först eller ha ett giltigt nuvarande pris.");
                    return;
                }

                payload.manualPrice = fallback;
                setManualInput(String(fallback));
            }

            setSaving(true);
            try {
                const res = await api.patchDbCompanyListing(companyId, payload);

                const itemPatch = patchFromItem(res?.item ?? {});
                applyPatch(itemPatch);
                setInfo(`Växlade till ${mode}.`);

                await refreshDb();
            } catch (e) {
                setErr(e?.message || "Kunde inte växla läge.");
            } finally {
                setSaving(false);
            }
        },
        [product, manualInput, merged, applyPatch, refreshDb]
    );

    const onRecompute = useCallback(async () => {
        const companyId = product?.__dbCompanyId;
        setErr("");
        setInfo("");

        if (!companyId) {
            setErr("Saknar companyId – kan inte räkna om.");
            return;
        }

        setSaving(true);
        try {
            const res = await api.applyDbAutoPrice(companyId);

            applyPatch({
                recommendedPrice: toNumber(res?.recommendedPrice) ?? merged.recommendedPrice ?? null,
            });

            setInfo("Pris uppdaterat.");
            await refreshDb();
        } catch (e) {
            setErr(e?.message || "Kunde inte räkna om.");
        } finally {
            setSaving(false);
        }
    }, [product, merged, applyPatch, refreshDb]);

    const competitors = toNumber(merged.competitorCount);
    const spreadMin = toNumber(merged.marketPriceMin);
    const spreadMax = toNumber(merged.marketPriceMax);
    const hasSpread = spreadMin != null && spreadMax != null && spreadMin > 0 && spreadMax > 0;

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
                    </div>

                    {err ? <div className="pricing-panel__error">{err}</div> : null}
                    {info ? <div className="pricing-panel__info">{info}</div> : null}
                </div>

                <div className="pricing-panel__actions">
                    <Button disabled={saving || isManual} onClick={onRecompute} variant="secondary">
                        Recompute
                    </Button>

                    <Button
                        disabled={saving}
                        onClick={() => onSwitchMode(isManual ? "AUTO" : "MANUAL")}
                        variant="secondary"
                    >
                        {isManual ? "Change to AUTO" : "Change to MANUAL"}
                    </Button>
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
                            disabled={saving}
                        />

                        <Button
                            onClick={onSaveManual}
                            disabled={saving}
                            variant="primary"
                        >
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