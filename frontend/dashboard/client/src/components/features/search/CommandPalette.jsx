import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../../lib/utils";

export default function CommandPalette({ open, onClose, items = [], actions = [] }) {
    const nav = useNavigate();
    const [q, setQ] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);

    const merged = useMemo(() => {
        const pageItems = items.map((i) => ({ ...i, kind: "page" }));
        const actItems = actions.map((a) => ({ ...a, kind: "action" }));
        return [...pageItems, ...actItems];
    }, [items, actions]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return merged;
        return merged.filter((x) => {
            const hay = `${x.label ?? ""} ${x.hint ?? ""} ${x.group ?? ""}`.toLowerCase();
            return hay.includes(s);
        });
    }, [merged, q]);

    useEffect(() => {
        if (!open) return;
        setQ("");
        setActive(0);
        const t = setTimeout(() => inputRef.current?.focus(), 0);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (active < 0) setActive(0);
        else if (active > filtered.length - 1) setActive(Math.max(0, filtered.length - 1));
    }, [active, filtered.length]);

    function run(item) {
        if (!item) return;
        if (item.kind === "page" && item.path) {
            nav(item.path);
            onClose?.();
            return;
        }
        if (item.kind === "action" && typeof item.onRun === "function") {
            item.onRun();
            onClose?.();
        }
    }

    function onKeyDown(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose?.();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((v) => Math.min(filtered.length - 1, v + 1));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((v) => Math.max(0, v - 1));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            run(filtered[active]);
        }
    }

    if (!open) return null;

    return (
        <div className="cp" role="dialog" aria-modal="true">
            <button className="cp__backdrop" onClick={onClose} aria-label="Stäng" />

            <div className="cp__panel" onKeyDown={onKeyDown}>
                <div className="cp__header">
                    <div className="cp__icon">⌘</div>
                    <input
                        ref={inputRef}
                        className="cp__input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search pages, products, actions..."
                        aria-label="Search"
                    />
                    <div className="cp__hint">
                        <span className="cp__kbd">↑</span>
                        <span className="cp__kbd">↓</span>
                        <span className="cp__kbd">⏎</span>
                        <span className="cp__kbd">Esc</span>
                    </div>
                </div>

                <div className="cp__list" role="listbox">
                    {filtered.length === 0 ? (
                        <div className="cp__empty">
                            <div className="cp__emptyTitle">No results</div>
                            <div>Try a different search</div>
                        </div>
                    ) : (
                        filtered.map((item, idx) => (
                            <button
                                key={`${item.kind}-${item.label}-${idx}`}
                                className={cn("cp__row", idx === active && "cp__row--active")}
                                onMouseEnter={() => setActive(idx)}
                                onClick={() => run(item)}
                            >
                <span className="cp__rowIcon" aria-hidden="true">
                  {item.icon ?? <span style={{ opacity: 0.6 }}>•</span>}
                </span>

                                <span className="cp__rowMain">
                  <span className="cp__rowLabel">{item.label}</span>
                                    {item.hint && <span className="cp__rowHint">{item.hint}</span>}
                </span>

                                <span className="cp__rowMeta">{item.kind === "action" ? "Action" : "Page"}</span>
                            </button>
                        ))
                    )}
                </div>

                <div className="cp__footer">
                    <div>{filtered.length} Result</div>
                    <div>Ipsum Lorem</div>
                </div>
            </div>
        </div>
    );
}