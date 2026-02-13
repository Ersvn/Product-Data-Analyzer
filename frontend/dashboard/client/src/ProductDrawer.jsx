import { useEffect, useRef } from "react";
import PriceHistory from "./PriceHistory.jsx";

function Money({ v }) {
    const n = Number(v || 0);
    return <span>{n.toLocaleString("sv-SE")} kr</span>;
}

export default function ProductDrawer({ open, onClose, product, fetchJson }) {
    const drawerRef = useRef(null);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }

        function onDocMouseDown(e) {
            if (!drawerRef.current) return;
            if (!drawerRef.current.contains(e.target)) {
                onClose?.();
            }
        }

        if (open) {
            window.addEventListener("keydown", onKey);
            document.addEventListener("mousedown", onDocMouseDown);
        }

        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDocMouseDown);
        };
    }, [open, onClose]);

    if (!open || !product) return null;

    return (
        <>
            {/* Overlay är VISUELL men blockerar inte scroll */}
            <div className="drawerOverlay" aria-hidden="true" />

            <aside ref={drawerRef} className="drawer" aria-label="Produktdetaljer">
                {product.imageUrl ? (
                    <div className="drawerImgBox">
                        <img
                            src={product.imageUrl}
                            alt={product.name}
                            loading="lazy"
                            className="drawerImg"
                            onError={(e) => {
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    </div>
                ) : null}

                <div className="drawerHeader">
                    <div style={{ minWidth: 0 }}>
                        <div className="drawerTitle" title={product.name}>
                            {product.name}
                        </div>
                        <div className="drawerSub">
                            {product.brand} · {product.category}
                        </div>
                    </div>

                    <button className="btn" onClick={onClose}>
                        Stäng
                    </button>
                </div>

                <div className="drawerCard">
                    <div className="drawerCardTop">
                        <div>
                            <div className="drawerLabel">Nuvarande pris</div>
                            <div className="drawerPrice">
                                <Money v={product.price} />
                            </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                            <div className="drawerLabel">EAN</div>
                            <div className="drawerEan">{product.ean}</div>
                        </div>
                    </div>

                    <div className="drawerMeta">
                        ID: {product.id ?? "-"} {product.store ? ` · Källa: ${product.store}` : ""}
                    </div>

                    {product.url ? (
                        <div style={{ marginTop: 10 }}>
                            <a href={product.url} target="_blank" rel="noreferrer" style={{ fontWeight: 850 }}>
                                Öppna produktlänk
                            </a>
                        </div>
                    ) : null}
                </div>

                <div style={{ marginTop: 16 }}>
                    <PriceHistory fetchJson={fetchJson} ean={String(product.ean)} title="Prishistorik" />
                </div>
            </aside>
        </>
    );
}
