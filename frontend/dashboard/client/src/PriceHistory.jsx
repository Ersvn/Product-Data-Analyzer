import { useEffect, useMemo, useRef, useState } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

function Money({ v }) {
    const n = Number(v || 0);
    return <span>{n.toLocaleString("sv-SE")} kr</span>;
}

function Stat({ label, value }) {
    return (
        <div className="phStat">
            <div className="phStatLabel">{label}</div>
            <div className="phStatValue">{value}</div>
        </div>
    );
}

function pct(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
    return ((a - b) / b) * 100;
}

function monthsToDays(m) {
    return Math.round(Number(m) * 30);
}

function useCssVar(name, fallback) {
    const [val, setVal] = useState(fallback);

    useEffect(() => {
        function read() {
            const v = getComputedStyle(document.documentElement)
                .getPropertyValue(name)
                .trim();
            setVal(v || fallback);
        }
        read();

        const obs = new MutationObserver(read);
        obs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });

        window.addEventListener("resize", read);
        return () => {
            obs.disconnect();
            window.removeEventListener("resize", read);
        };
    }, [name, fallback]);

    return val;
}

function PeriodDropdown({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [hover, setHover] = useState(null);
    const ref = useRef(null);

    const options = [
        { label: "1 månad", value: 1 },
        { label: "3 månader", value: 3 },
        { label: "6 månader", value: 6 },
        { label: "12 månader", value: 12 },
    ];

    const current = options.find((o) => o.value === value) || options[1];

    useEffect(() => {
        function onDoc(e) {
            if (!ref.current) return;
            if (!ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const btnStyle = {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid var(--stroke)",
        background: "var(--surface)",
        color: "var(--text)",
        fontWeight: 800,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        userSelect: "none",
    };

    const menuStyle = {
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        minWidth: 220,
        borderRadius: 14,
        border: "1px solid var(--stroke)",
        background: "var(--surface)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
        overflow: "hidden",
        zIndex: 50,
    };

    const itemStyle = (active, isHover) => ({
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        border: 0,
        background: active
            ? "rgba(138,180,255,0.18)"
            : isHover
                ? "rgba(255,255,255,0.07)"
                : "transparent",
        color: "var(--text)",
        cursor: "pointer",
        fontWeight: active ? 900 : 750,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    });

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button type="button" onClick={() => setOpen((v) => !v)} style={btnStyle}>
                {current.label}
                <span style={{ color: "var(--muted)", fontWeight: 900 }}>▾</span>
            </button>

            {open && (
                <div role="listbox" style={menuStyle}>
                    {options.map((o) => {
                        const active = o.value === value;
                        const isHover = hover === o.value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                onMouseEnter={() => setHover(o.value)}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => {
                                    onChange(o.value);
                                    setOpen(false);
                                }}
                                style={itemStyle(active, isHover)}
                            >
                                <span>{o.label}</span>
                                {active ? <span style={{ color: "var(--accent)" }}>✓</span> : null}
                            </button>
                        );
                    })}
                </div>
            )}
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

export default function PriceHistory({ fetchJson, ean, title }) {
    const [months, setMonths] = useState(3);
    const days = useMemo(() => monthsToDays(months), [months]);

    const [raw, setRaw] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const chartTick = useCssVar("--chartTick", "rgba(255,255,255,0.72)");
    const chartGrid = useCssVar("--chartGrid", "rgba(255,255,255,0.12)");
    const marketStroke = useCssVar("--marketStroke", "#8ab4ff");
    const companyStroke = useCssVar("--companyStroke", "#2ed573");

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

    const hasMarket = useMemo(() => series.some((p) => Number.isFinite(p.marketPrice)), [series]);
    const hasCompany = useMemo(() => series.some((p) => Number.isFinite(p.companyPrice)), [series]);

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
        const p = pct(last, vPrev);

        return { last, min, max, d, p };
    }, [series, hasCompany, hasMarket]);

    const noHistory = !loading && !err && series.length === 0;
    const axisTick = { fill: chartTick, fontSize: 12 };

    return (
        <div className="card" style={{ marginTop: 12, background: "var(--surface)" }}>
            <div className="card-pad">
                <div className="phHeader">
                    <div>
                        <div className="phTitle">{title || "Prishistorik"}</div>
                        <div className="phSub">EAN: {ean}</div>
                    </div>

                    <div className="phToolbar">
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Period</span>
                        <PeriodDropdown value={months} onChange={setMonths} />
                    </div>
                </div>

                <div className="phDivider" />

                <div className="phLegend">
          <span className="phLegendPill">
            <span className="phDot" style={{ background: marketStroke }} />
            Marknadspris
          </span>
                    <span className="phLegendPill">
            <span className="phDot" style={{ background: companyStroke }} />
            Vårt pris
          </span>
                </div>

                {loading ? <div style={{ marginTop: 12, color: "var(--muted)" }}>Laddar historik…</div> : null}

                {!loading && err ? (
                    <div className="phError">
                        <b>Fel:</b> {err}
                    </div>
                ) : null}

                {!loading && !err && metrics ? (
                    <div className="phStats">
                        <Stat label="Senaste pris" value={<Money v={metrics.last} />} />
                        <Stat
                            label="Förändring (ca 1 månad)"
                            value={
                                <span>
                  {metrics.d >= 0 ? "+" : ""}
                                    <Money v={Math.round(metrics.d)} />{" "}
                                    <span style={{ color: "var(--muted2)", fontWeight: 800 }}>
                    ({metrics.p >= 0 ? "+" : ""}
                                        {metrics.p.toFixed(1)}%)
                  </span>
                </span>
                            }
                        />
                        <Stat
                            label="Min / Max"
                            value={
                                <span>
                  <Money v={metrics.min} /> – <Money v={metrics.max} />
                </span>
                            }
                        />
                    </div>
                ) : null}

                {!loading && !err ? (
                    <div className="phChart">
                        {noHistory ? (
                            <div style={{ color: "var(--muted)" }}>Ingen historik tillgänglig.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series}>
                                    <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={axisTick} axisLine={{ stroke: chartGrid }} tickLine={{ stroke: chartGrid }} />
                                    <YAxis tick={axisTick} axisLine={{ stroke: chartGrid }} tickLine={{ stroke: chartGrid }} />

                                    <Tooltip
                                        contentStyle={{
                                            background: "var(--surface2)",
                                            border: "1px solid var(--stroke)",
                                            borderRadius: 14,
                                            color: "var(--text)",
                                        }}
                                        labelStyle={{ color: "var(--text)", fontWeight: 900 }}
                                        formatter={(value, name) => {
                                            const label = name === "marketPrice" ? "Marknadspris" : "Vårt pris";
                                            return [`${Number(value).toLocaleString("sv-SE")} kr`, label];
                                        }}
                                        labelFormatter={(label) => `Datum: ${label}`}
                                    />

                                    {hasMarket ? (
                                        <Line type="monotone" dataKey="marketPrice" dot={false} stroke={marketStroke} strokeWidth={2} connectNulls />
                                    ) : null}

                                    {hasCompany ? (
                                        <Line type="monotone" dataKey="companyPrice" dot={false} stroke={companyStroke} strokeWidth={3} connectNulls />
                                    ) : null}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
