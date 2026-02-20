// src/components/InlineSearchResults.jsx
import { useEffect, useMemo, useRef, useState } from "react";

function cx(...a) {
    return a.filter(Boolean).join(" ");
}

export default function InlineSearchResults({
                                                open,
                                                query,
                                                items,
                                                activeIndex,
                                                setActiveIndex,
                                                onPick,
                                                onClose,
                                                anchorRef,
                                            }) {
    const listRef = useRef(null);

    // Keep active item visible
    useEffect(() => {
        if (!open) return;
        const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
        el?.scrollIntoView?.({ block: "nearest" });
    }, [open, activeIndex]);

    const hint = useMemo(() => {
        if (!query) return "Skriv för att söka…";
        if (!items.length) return "Inga träffar.";
        return `${items.length} träffar`;
    }, [query, items.length]);

    if (!open) return null;

    const rect = anchorRef?.current?.getBoundingClientRect?.();
    const style =
        rect
            ? {
                position: "fixed",
                left: rect.left,
                top: rect.bottom + 8,
                width: rect.width,
                zIndex: 9999,
            }
            : undefined;

    return (
        <div className="isr" style={style} role="listbox" aria-label="Search results">
            <div className="isr__top">
                <div className="isr__hint">{hint}</div>
                <button className="isr__x" type="button" onClick={onClose} aria-label="Close results">
                    ✕
                </button>
            </div>

            <div className="isr__list" ref={listRef}>
                {items.slice(0, 8).map((it, idx) => (
                    <button
                        key={it.ean}
                        type="button"
                        className={cx("isr__item", idx === activeIndex && "isr__item--active")}
                        data-idx={idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => onPick(it)}
                    >
                        <div className="isr__main">
                            <div className="isr__title" title={it.name}>
                                {it.name}
                            </div>
                            <div className="isr__meta">
                                {it.brand} · {it.category} · <span className="isr__ean">{it.ean}</span>
                            </div>
                        </div>

                        <div className="isr__right">
              <span className={cx("isr__badge", it.diffKr > 0 ? "isr__badge--bad" : it.diffKr < 0 ? "isr__badge--good" : "")}>
                {it.diffKr > 0 ? `+${Math.round(it.diffKr)} kr` : it.diffKr < 0 ? `${Math.round(it.diffKr)} kr` : "0 kr"}
              </span>
                            <span className="isr__cta">Välj</span>
                        </div>
                    </button>
                ))}

                {query && items.length === 0 ? (
                    <div className="isr__empty">Inga produkter matchade.</div>
                ) : null}
            </div>

            <div className="isr__footer">
                <span>Enter: välj</span>
                <span>↑/↓: navigera</span>
                <span>Esc: stäng</span>
            </div>
        </div>
    );
}
