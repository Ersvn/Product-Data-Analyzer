import { useEffect, useMemo, useState } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { formatMoney } from "../../../lib/utils";
import { Button } from "../../ui/Button";

function Stat({ label, value }) {
    return (
        <div className="phStat">
            <div className="phStatLabel">{label}</div>
            <div className="phStatValue">{value}</div>
        </div>
    );
}

function toIsoDate(ts) {
    try {
        return new Date(ts).toISOString().slice(0, 10);
    } catch {
        return String(ts).slice(0, 10);
    }
}

const PERIODS = [
    { label: "1 month", value: 1, days: 30 },
    { label: "3 months", value: 3, days: 90 },
    { label: "6 months", value: 6, days: 180 },
    { label: "12 months", value: 12, days: 365 },
];

export default function PriceHistory({ fetchJson, ean, title, showExport = true }) {
    const [months, setMonths] = useState(3);
    const [raw, setRaw] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const days = useMemo(
        () => PERIODS.find((p) => p.value === months)?.days || 90,
        [months]
    );

    useEffect(() => {
        if (!ean) return;
        let alive = true;
        setLoading(true);
        setErr("");

        fetchJson(`/api/history/compare/${encodeURIComponent(ean)}?days=${days}&limit=500`)
            .then((json) => {
                if (!alive) return;
                setRaw(json);
            })
            .catch((e) => {
                if (!alive) return;
                setErr(String(e?.message || e));
            })
            .finally(() => {
                if (!alive) return;
                setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [fetchJson, ean, days]);

    const series = useMemo(() => {
        const market = Array.isArray(raw?.market) ? raw.market : [];
        const company = Array.isArray(raw?.company) ? raw.company : [];
        const map = new Map();

        for (const p of market) {
            const date = toIsoDate(p.ts);
            const prev = map.get(date) || { date, marketPrice: null, companyPrice: null };
            const v = Number(p.price);
            prev.marketPrice = Number.isFinite(v) ? v : prev.marketPrice;
            map.set(date, prev);
        }

        for (const p of company) {
            const date = toIsoDate(p.ts);
            const prev = map.get(date) || { date, marketPrice: null, companyPrice: null };
            const v = Number(p.price);
            prev.companyPrice = Number.isFinite(v) ? v : prev.companyPrice;
            map.set(date, prev);
        }

        return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    }, [raw]);

    const hasMarket = useMemo(
        () => series.some((p) => Number.isFinite(p.marketPrice)),
        [series]
    );
    const hasCompany = useMemo(
        () => series.some((p) => Number.isFinite(p.companyPrice)),
        [series]
    );

    const metrics = useMemo(() => {
        if (!series.length) return null;
        const primaryKey = hasCompany ? "companyPrice" : "marketPrice";
        const vals = series
            .map((p) => Number(p[primaryKey]))
            .filter((v) => Number.isFinite(v));

        if (!vals.length) return null;

        const last = vals[vals.length - 1];
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const idx = Math.max(0, vals.length - 30);
        const vPrev = vals[idx];
        const d = last - vPrev;
        const p = ((last - vPrev) / vPrev) * 100;

        return { last, min, max, d, p };
    }, [series, hasCompany]);

    const handleExport = () => {
        const csv = series.map((s) => ({
            Datum: s.date,
            Marknadspris: s.marketPrice || "",
            Vårt_pris: s.companyPrice || "",
        }));
        // ... export logic
    };

    const noHistory = !loading && !err && series.length === 0;

    return (
        <div className="card" style={{ marginTop: 20 }}>
            <div className="card-pad">
                <div className="phHeader">
                    <div>
                        <div className="phTitle">{title || "Pricehistory"}</div>
                        <div className="phSub">EAN: {ean}</div>
                    </div>

                    <div className="phToolbar">
                        <div className="segmented">
                            {PERIODS.map((p) => (
                                <button
                                    key={p.value}
                                    className={`segBtn ${months === p.value ? "segBtnActive" : ""}`}
                                    onClick={() => setMonths(p.value)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {showExport && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleExport}
                                disabled={!series.length}
                            >
                                Export CSV
                            </Button>
                        )}
                    </div>
                </div>

                <div className="phDivider" />

                <div className="phLegend">
          <span className="phLegendPill">
            <span className="phDot phDot--market" />
            Market prices
          </span>
                    <span className="phLegendSpacer" />
                    |

                    <span className="phLegendPill">
            <span className="phDot phDot--company" />
            Our price
          </span>
                </div>

                {loading && <div className="phLoading">Laddar historik…</div>}

                {!loading && err && (
                    <div className="phError">
                        <strong>Fel:</strong> {err}
                    </div>
                )}

                {!loading && !err && metrics && (
                    <div className="phStats">
                        <Stat label="Latest price" value={formatMoney(metrics.last)} />
                        <Stat
                            label="Change (30 days)"
                            value={
                                <span>
                  {metrics.d >= 0 ? "+" : ""}
                                    {formatMoney(metrics.d)}
                                    <span className="phStats__pct">
                    ({metrics.p >= 0 ? "+" : ""}
                                        {metrics.p.toFixed(1)}%)
                  </span>
                </span>
                            }
                        />
                        <Stat
                            label="Min / Max"
                            value={`${formatMoney(metrics.min)} – ${formatMoney(metrics.max)}`}
                        />
                    </div>
                )}

                {!loading && !err && (
                    <div className="phChart">
                        {noHistory ? (
                            <div className="phEmpty">Ingen historik tillgänglig.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    {/* FIX: use chartGrid token (now exists) */}
                                    <CartesianGrid stroke="var(--chartGrid)" strokeDasharray="3 3" />

                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: "var(--chartTick)", fontSize: 11 }}
                                        axisLine={{ stroke: "var(--chartGrid)" }}
                                        tickLine={false}
                                    />

                                    <YAxis
                                        tick={{ fill: "var(--chartTick)", fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => formatMoney(v)}
                                    />

                                    <Tooltip
                                        contentStyle={{
                                            background: "var(--surface)",
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 10,
                                            color: "var(--text)",
                                            boxShadow: "var(--shadow-lg)",
                                        }}
                                        labelStyle={{
                                            color: "var(--text-secondary)",
                                            fontWeight: 700,
                                            marginBottom: 6,
                                        }}
                                        itemStyle={{
                                            color: "var(--text)",
                                            fontWeight: 600,
                                        }}
                                        formatter={(value, name) => [
                                            formatMoney(value),
                                            name === "marketPrice" ? "Marknadspris" : "Vårt pris",
                                        ]}
                                    />

                                    {hasMarket && (
                                        <Line
                                            type="monotone"
                                            dataKey="marketPrice"
                                            stroke="var(--marketStroke)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    )}

                                    {hasCompany && (
                                        <Line
                                            type="monotone"
                                            dataKey="companyPrice"
                                            stroke="var(--companyStroke)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
