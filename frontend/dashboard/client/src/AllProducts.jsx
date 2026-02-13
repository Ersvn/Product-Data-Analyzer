import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ProductDrawer from "./ProductDrawer";
import ProductThumb from "./ProductThumb.jsx";

function Money({ v }) {
    const n = Number(v || 0);
    return <span>{n.toLocaleString("sv-SE")} kr</span>;
}

function Chip({ children }) {
    return <span className="chip">{children}</span>;
}

function BigChoice({ value, onChange }) {
    return (
        <div className="segmented" role="radiogroup" aria-label="Välj källa">
            <button
                type="button"
                className={`segBtn ${value === "market" ? "segBtnActive" : ""}`}
                onClick={() => onChange("market")}
                aria-checked={value === "market"}
                role="radio"
            >
                <span className={`segDot ${value === "market" ? "segDotActive" : ""}`} />
                Market
            </button>

            <button
                type="button"
                className={`segBtn ${value === "company" ? "segBtnActive" : ""}`}
                onClick={() => onChange("company")}
                aria-checked={value === "company"}
                role="radio"
            >
                <span className={`segDot ${value === "company" ? "segDotActive" : ""}`} />
                Placeholder
            </button>
        </div>
    );
}

export default function AllProducts({ fetchJson }) {
    const [source, setSource] = useState("market"); // market | company
    const [q, setQ] = useState("");
    const [limit, setLimit] = useState(200);

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1, limit: 200 });
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const [selected, setSelected] = useState(null);
    const drawerOpen = !!selected;

    const endpoint = useMemo(() => {
        return source === "company" ? "/api/company/products" : "/api/products";
    }, [source]);

    useEffect(() => {
        setRows([]);
        setMeta({ total: 0, page: 1, totalPages: 1, limit });
        setPage(1);
        setErr("");
        setSelected(null);
    }, [endpoint, q, limit]);

    useEffect(() => {
        let alive = true;

        async function run() {
            setLoading(true);
            setErr("");

            try {
                const qs = new URLSearchParams();
                qs.set("page", String(page));
                qs.set("limit", String(limit));
                if (q.trim()) qs.set("q", q.trim());

                const json = await fetchJson(`${endpoint}?${qs.toString()}`);

                const nextData = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

                const nextMeta =
                    json?.meta ??
                    (typeof json?.total === "number"
                        ? { total: json.total, page, limit, totalPages: Math.ceil(json.total / limit) }
                        : null);

                if (!alive) return;

                setRows((prev) => (page === 1 ? nextData : [...prev, ...nextData]));
                if (nextMeta) setMeta(nextMeta);
            } catch (e) {
                if (!alive) return;
                setErr(String(e?.message || e));
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        }

        run();
        return () => {
            alive = false;
        };
    }, [endpoint, page, limit, q, fetchJson]);

    const canLoadMore = page < (meta?.totalPages || 1);
    const parentRef = useRef(null);

    // “Nudge” så virtualizer håller sig stabil när drawer öppnas (utan att låsa scroll)
    useEffect(() => {
        const el = parentRef.current;
        if (!el) return;

        const x = el.scrollLeft;
        const y = el.scrollTop;

        requestAnimationFrame(() => {
            el.scrollTop = y + 1;
            el.scrollTop = y;
            el.scrollLeft = x + 1;
            el.scrollLeft = x;
        });
    }, [drawerOpen]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 86,
        overscan: 12,
    });

    useEffect(() => {
        const items = rowVirtualizer.getVirtualItems();
        if (!items.length) return;

        const last = items[items.length - 1];
        const nearEnd = last.index >= rows.length - 20;

        if (nearEnd && !loading && !err && canLoadMore) {
            setPage((p) => p + 1);
        }
    }, [rowVirtualizer.getVirtualItems(), rows.length, loading, err, canLoadMore]);

    const selectedKey = selected ? String(selected.id ?? selected.ean) : null;

    return (
        <div style={{ position: "relative" }}>
            <div className="row" style={{ marginBottom: 12 }}>
                <div className="actions">
                    <BigChoice value={source} onChange={setSource} />

                    <Chip>
                        Visar: <b style={{ color: "inherit" }}>{rows.length.toLocaleString("sv-SE")}</b>
                        {meta?.total ? ` / ${meta.total.toLocaleString("sv-SE")}` : ""}
                    </Chip>

                    <Chip>Klicka på en produkt för detaljer</Chip>
                </div>

                <div className="actions">
                    <input
                        className="input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök (namn, brand, kategori, EAN)…"
                        style={{ width: 420, maxWidth: "100%" }}
                    />

                    <div className="selectWrap">
                        <select className="select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                            <option value={100}>100 / sida</option>
                            <option value={200}>200 / sida</option>
                            <option value={500}>500 / sida</option>
                        </select>
                        <span className="selectChevron">▾</span>
                    </div>
                </div>
            </div>

            {err ? (
                <div className="card" style={{ marginTop: 10, borderColor: "rgba(239,68,68,0.35)" }}>
                    <div className="card-pad" style={{ background: "rgba(239,68,68,0.10)", borderRadius: 18 }}>
                        <b>Fel:</b> {err}
                    </div>
                </div>
            ) : null}

            <div style={{ position: "relative" }}>
                <div
                    ref={parentRef}
                    className="virtualWrap"
                    style={{
                        /* Du kan scrolla listan även om drawer är öppen */
                        direction: drawerOpen ? "rtl" : "ltr",
                    }}
                    aria-label="Produkter"
                >
                    <div className="virtualInner" style={{ height: rowVirtualizer.getTotalSize(), direction: "ltr" }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const p = rows[virtualRow.index];
                            if (!p) return null;

                            const rowKey = String(p.id ?? p.ean);
                            const isSelected = selectedKey === rowKey;

                            // 100% stabil zebra (virtual rows + absolute)
                            const zebra = virtualRow.index % 2 === 0 ? "var(--zebra1)" : "var(--zebra2)";

                            return (
                                <div
                                    key={`${rowKey}-${virtualRow.index}`}
                                    className={`virtualRow ${isSelected ? "virtualRowSelected" : ""}`}
                                    onClick={() => setSelected(p)}
                                    style={{
                                        transform: `translateY(${virtualRow.start}px)`,
                                        background: zebra,
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") setSelected(p);
                                    }}
                                    title="Klicka för detaljer"
                                >
                                    <div className="virtualLeft">
                                        <ProductThumb src={p.imageUrl} alt={p.name} />
                                        <div className="virtualTexts">
                                            <div className="virtualTitle" title={p.name}>
                                                {p.name}
                                            </div>
                                            <div className="virtualMeta">
                                                {p.brand} · {p.category} · EAN: {p.ean}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="virtualRight">
                                        {p.store ? <span className="chip">{p.store}</span> : null}

                                        <div className="virtualPrice">
                                            <Money v={p.price} />
                                        </div>

                                        {p.url ? (
                                            <a
                                                href={p.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="virtualLink"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Öppna
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {drawerOpen ? <div aria-hidden="true" className="scrollHint" /> : null}
            </div>

            <div style={{ marginTop: 10, color: "var(--muted2)", fontSize: 12 }}>
                {loading ? "Laddar…" : canLoadMore ? "Scrolla för att ladda mer." : ""}
            </div>

            <ProductDrawer open={drawerOpen} onClose={() => setSelected(null)} product={selected} fetchJson={fetchJson} />
        </div>
    );
}
