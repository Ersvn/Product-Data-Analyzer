import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function HighlightsBar({ stats, focus, onClearFocus }) {
    const nav = useNavigate();

    const overpriced = useMemo(() => stats?.overpricedCount ?? 0, [stats]);
    const underpriced = useMemo(() => stats?.underpricedCount ?? 0, [stats]);

    const focusStr = String(focus || "").trim();
    const hasFocus = !!focusStr;

    return (
        <section className="hl">
            <div className="hl__grid">
                <div className="hlCard">
                    <div className="hlCard__top">
                        <div className="hlCard__label">Expensive products</div>
                        <div className="hlCard__value">{overpriced.toLocaleString("sv-SE")}</div>
                    </div>
                    <div className="hlCard__sub">Biggest potential to lower overpricing.</div>
                    <div className="hlCard__actions">
                        <button className="btn btn--ghost" onClick={() => nav("/products?focus=overpriced")}>
                            Visa
                        </button>
                        {/* Historik öppnas utan “mode”-param – history väljer default fokus */}
                        <button className="btn" onClick={() => nav("/history")}>
                            Historik
                        </button>
                    </div>
                </div>

                <div className="hlCard">
                    <div className="hlCard__top">
                        <div className="hlCard__label">Cheap products</div>
                        <div className="hlCard__value">{underpriced.toLocaleString("sv-SE")}</div>
                    </div>
                    <div className="hlCard__sub">Risk of being below market.</div>
                    <div className="hlCard__actions">
                        <button className="btn btn--ghost" onClick={() => nav("/products?focus=underpriced")}>
                            Visa
                        </button>
                        <button className="btn" onClick={() => nav("/history")}>
                            Historik
                        </button>
                    </div>
                </div>

                <div className="hlCard hlCard--focus">
                    <div className="hlCard__top">
                        <div className="hlCard__label">Fokus</div>
                        <div className="hlCard__value">{hasFocus ? "Aktivt" : "Inget"}</div>
                    </div>

                    <div className="hlCard__sub">
                        {hasFocus ? (
                            <>
                                Fokus EAN: <span style={{ color: "var(--muted)" }}>{focusStr}</span>
                            </>
                        ) : (
                            "Välj en produkt i listan för att öppna historik."
                        )}
                    </div>

                    <div className="hlCard__actions">
                        <button
                            className="btn btn--ghost"
                            disabled={!hasFocus}
                            title={!hasFocus ? "Välj en fokusprodukt först" : "Öppna historik för fokusprodukten"}
                            onClick={() => nav(`/history?focus=${encodeURIComponent(focusStr)}`)}
                        >
                            Öppna historik
                        </button>

                        <button className="btn" disabled={!hasFocus} onClick={onClearFocus}>
                            Rensa
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
