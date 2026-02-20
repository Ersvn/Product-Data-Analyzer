import { useEffect, useMemo, useRef } from "react";
import PriceHistory from "../charts/PriceHistory";
import PricingPanel from "./PricingPanel";
import ProductThumb from "./ProductThumb";
import { Button } from "../../ui/Button";

export default function ProductDrawer({ open, onClose, product, fetchJson, onProductUpdate }) {
    const drawerRef = useRef(null);
    const p = useMemo(() => (open && product ? product : null), [open, product]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        function onDocMouseDown(e) {
            if (!drawerRef.current?.contains(e.target)) onClose?.();
        }

        if (open) {
            window.addEventListener("keydown", onKey);
            document.addEventListener("mousedown", onDocMouseDown);
            document.body.classList.add("drawer-open");
        } else {
            document.body.classList.remove("drawer-open");
        }

        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDocMouseDown);
            document.body.classList.remove("drawer-open");
        };
    }, [open, onClose]);

    if (!open || !p) return null;

    const eanKey = p?.ean != null ? String(p.ean) : "";

    return (
        <>
            <div className="drawerOverlay" onClick={onClose} />
            <aside ref={drawerRef} className="drawer">
                <div className="drawerHeader">
                    <div style={{ minWidth: 0 }}>
                        <div className="drawerTitle" title={p.name}>
                            {p.name}
                        </div>
                        <div className="drawerSub">
                            {p.brand} · {p.category}
                        </div>
                    </div>
                    <Button onClick={onClose} variant="secondary" size="sm">
                        Stäng
                    </Button>
                </div>

                <div className="drawerContent">
                    {p.imageUrl && (
                        <div className="drawerImgBox">
                            <img src={p.imageUrl} alt={p.name} loading="lazy" className="drawerImg" />
                        </div>
                    )}

                    <div className="drawerCard">
                        <div className="drawerCardTop">
                            <div>
                                <div className="drawerLabel">EAN</div>
                                <div className="drawerEan">{p.ean || "—"}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div className="drawerLabel">Källa</div>
                                <div className="drawerEan">{p.store || "—"}</div>
                            </div>
                        </div>
                        <div className="drawerMeta">ID: {p.id ?? "—"}</div>
                        {p.url && (
                            <a href={p.url} target="_blank" rel="noreferrer" className="drawerLink">
                                Öppna produktlänk →
                            </a>
                        )}
                    </div>

                    {/* 🔑 Viktigt: använd EAN som stabil key, inte id (id skiljer sig mellan market/company listor) */}
                    <PricingPanel
                        productKey={eanKey}
                        product={p}
                        onProductPatched={(patch) => {
                            if (!patch) return;
                            onProductUpdate?.({ ...p, ...patch });
                        }}
                    />

                    <PriceHistory fetchJson={fetchJson} ean={eanKey} title="Prishistorik" />
                </div>
            </aside>
        </>
    );
}
