// src/components/GlobalSearchModal.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function GlobalSearchModal({ open, onClose, fetchJson }) {
    const nav = useNavigate();
    const inputRef = useRef(null);

    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [items, setItems] = useState([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    useEffect(() => {
        if (open) return;
        setQ("");
        setItems([]);
        setErr("");
        setActive(0);
        setLoading(false);
    }, [open]);

    const query = q.trim();

    useEffect(() => {
        let alive = true;
        if (!open) return;

        if (query.length < 2) {
            setItems([]);
            setErr("");
            setLoading(false);
            return;
        }

        async function run() {
            setLoading(true);
            setErr("");

            try {
                const cmp = await fetchJson("/api/compare");
                const matched = Array.isArray(cmp?.matched) ? cmp.matched : [];
                const s = query.toLowerCase();

                const mapped = matched
                    .map((row) => ({
                        id: String(row.ean),
                        ean: String(row.ean),
                        name: row?.company?.name || row?.market?.name || "-",
                        brand: row?.company?.brand || row?.market?.brand || "-",
                        category: row?.company?.category || row?.market?.category || "-",
                        imageUrl: row?.company?.imageUrl || row?.market?.imageUrl || null,
                        // extra: pricing quick glance
                        marketPrice: Number(row?.market?.price ?? 0),
                        companyPrice: Number(row?.company?.price ?? 0),
                        diffKr: Number(row?.priceDiff ?? 0),
                    }))
                    .filter((r) =>
                        [r.ean, r.name, r.brand, r.category].some((v) =>
                            String(v).toLowerCase().includes(s)
                        )
                    )
                    .slice(0, 12);

                if (!alive) return;
                setItems(mapped);
                setActive(0);
            } catch (e) {
                if (!alive) return;
                setErr(String(e?.message || e));
                setItems([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        }

        run();
        return () => {
            alive = false;
        };
    }, [open, query, fetchJson]);

    const hint = useMemo(() => {
        if (!query) return "Search for EAN, name, brand…";
        if (loading) return "Searching…";
        if (err) return "Could not search.";
        if (!items.length) return "No hits.";
        return `${items.length} hits`;
    }, [query, loading, err, items.length]);

    function openItem(it) {
        if (!it) return;
        onClose?.();
        nav(`/history?focus=${encodeURIComponent(it.ean)}`);
    }

    function onKeyDown(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose?.();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            openItem(items[active]);
        }
    }

    if (!open) return null;

    return (
        <div className="gsBackdrop" role="dialog" aria-modal="true" onMouseDown={onClose}>
            <div className="gsModal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="gsTop">
                    <input
                        ref={inputRef}
                        className="input gsInput"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search (EAN, namn, brand)…"
                        onKeyDown={onKeyDown}
                    />
                    <div className="gsHint">{hint}</div>
                </div>

                <div className="gsList" role="listbox" aria-label="Search results">
                    {items.map((it, idx) => {
                        const activeRow = idx === active;
                        const badge =
                            it.diffKr > 0 ? `+${Math.round(it.diffKr)} kr` : it.diffKr < 0 ? `${Math.round(it.diffKr)} kr` : "0 kr";

                        return (
                            <button
                                key={it.id}
                                type="button"
                                className={`gsItem ${activeRow ? "isActive" : ""}`}
                                onMouseEnter={() => setActive(idx)}
                                onClick={() => openItem(it)}
                            >
                                <div className="gsItem__main">
                                    <div className="gsItem__title" title={it.name}>
                                        {it.name}
                                    </div>
                                    <div className="gsItem__meta">
                                        {it.brand} · {it.category} · <span className="gsItem__ean">{it.ean}</span>
                                    </div>
                                </div>

                                <div className="gsItem__right">
                                    <span className="gsBadge">{badge}</span>
                                    <span className="gsItem__cta">Open</span>
                                </div>
                            </button>
                        );
                    })}

                    {!loading && !err && query && items.length === 0 ? (
                        <div className="gsEmpty">No products matched your search.</div>
                    ) : null}

                    {err ? <div className="gsError">Error: {err}</div> : null}
                </div>

                <div className="gsFooter">
                    <span>Enter: Open</span>
                    <span>↑/↓: Choose</span>
                    <span>Esc: Close</span>
                </div>
            </div>
        </div>
    );
}
