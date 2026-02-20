import { useState, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ProductDrawer from "./ProductDrawer";
import ProductThumb from "./ProductThumb";
import PriceModeBadge from "./PriceModeBadge";
import { api } from "../../../lib/api";
import { useDebounce } from "../../../hooks/useDebounce";
import { formatMoney, cn } from "../../../lib/utils";

const PAGE_SIZE = 100;

export default function AllProducts({ source: initialSource = "market" }) {
    const [source, setSource] = useState(initialSource);
    const [q, setQ] = useState("");
    const debouncedQ = useDebounce(q, 300);

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [selected, setSelected] = useState(null);
    const [overrides, setOverrides] = useState(new Map());

    const parentRef = useRef(null);

    const fetchData = useCallback(async (pageNum, append = false) => {
        setLoading(true);
        setErr("");

        try {
            const endpoint = source === 'company' ? 'fetchCompanyProducts' : 'fetchProducts';
            const res = await api[endpoint]({
                q: debouncedQ,
                page: pageNum,
                limit: PAGE_SIZE
            });

            const newData = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

            if (!append) {
                setRows(newData);
            } else {
                setRows(prev => [...prev, ...newData]);
            }

            setMeta(res?.meta || {
                total: res?.total || 0,
                page: pageNum,
                totalPages: Math.ceil((res?.total || 0) / PAGE_SIZE)
            });
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    }, [source, debouncedQ]);

    useEffect(() => {
        setPage(1);
        fetchData(1, false);
    }, [source, debouncedQ, fetchData]);

    const loadMore = useCallback(() => {
        if (page < meta.totalPages && !loading) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchData(nextPage, true);
        }
    }, [page, meta.totalPages, loading, fetchData]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72,
        overscan: 5,
    });

    useEffect(() => {
        const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
        if (!lastItem) return;

        if (lastItem.index >= rows.length - 10 && !loading && page < meta.totalPages) {
            loadMore();
        }
    }, [rowVirtualizer.getVirtualItems(), rows.length, loading, page, meta.totalPages, loadMore]);

    const applyOverride = (updatedProduct) => {
        if (!updatedProduct?.id) return;
        const key = String(updatedProduct.id);
        setOverrides(prev => new Map(prev).set(key, updatedProduct));
        setSelected(prev => prev ? { ...prev, ...updatedProduct } : null);
    };

    const getEffectivePrice = (p) => {
        const override = overrides.get(String(p.id));
        const product = override ? { ...p, ...override } : p;

        if (product.priceMode === 'MANUAL' && product.manualPrice != null) {
            return product.manualPrice;
        }
        return product.recommendedPrice || product.ourPrice || product.price;
    };

    return (
        <div>
            <div className="row" style={{ marginBottom: 16 }}>
                <div className="segmented">
                    <button
                        className={cn("segBtn", source === 'market' && "segBtnActive")}
                        onClick={() => setSource('market')}
                    >
                        Marknad
                    </button>
                    <button
                        className={cn("segBtn", source === 'company' && "segBtnActive")}
                        onClick={() => setSource('company')}
                    >
                        Vårt lager
                    </button>
                </div>

                <div className="actions">
                    <input
                        className="input"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Sök..."
                        style={{ width: 280 }}
                    />
                    <span className="badge">
            {rows.length.toLocaleString('sv-SE')} / {meta.total.toLocaleString('sv-SE')}
          </span>
                </div>
            </div>

            {err && (
                <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>
                    <div className="card-pad" style={{ color: 'var(--danger)' }}>
                        Fel: {err}
                    </div>
                </div>
            )}

            <div
                ref={parentRef}
                className="virtualWrap"
                style={{ height: 600 }}
            >
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const p = rows[virtualRow.index];
                        if (!p) return null;

                        const price = getEffectivePrice(p);

                        return (
                            <div
                                key={p.id || p.ean}
                                className="virtualRow"
                                onClick={() => setSelected(p)}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <div className="virtualLeft">
                                    <ProductThumb src={p.imageUrl} alt={p.name} />
                                    <div className="virtualTexts">
                                        <div className="virtualTitle">{p.name}</div>
                                        <div className="virtualMeta">
                                            {p.brand} · {p.category} · {p.ean}
                                        </div>
                                    </div>
                                </div>

                                <div className="virtualRight">
                                    {source === 'company' && (
                                        <PriceModeBadge priceMode={p.priceMode} manualPrice={p.manualPrice} />
                                    )}
                                    <span className="virtualPrice">{formatMoney(price)}</span>
                                    {p.store && <span className="badge">{p.store}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {loading && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>
                        Laddar...
                    </div>
                )}
            </div>

            <ProductDrawer
                open={!!selected}
                onClose={() => setSelected(null)}
                product={selected}
                fetchJson={api.request.bind(api)}
                onProductUpdate={applyOverride}
            />
        </div>
    );
}