import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import PriceHistory from "../components/features/charts/PriceHistory";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useLocalStorage } from "../hooks/useLocalStorage";

const RECENT_KEY = "recent_eans";

export default function HistoryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [ean, setEan] = useState(searchParams.get('focus') || "");
    const [picked, setPicked] = useState(searchParams.get('focus') || "");
    const [recent, setRecent] = useLocalStorage(RECENT_KEY, []);

    useEffect(() => {
        if (picked && !recent.includes(picked)) {
            setRecent(prev => [picked, ...prev].slice(0, 10));
        }
    }, [picked, recent, setRecent]);

    useEffect(() => {
        if (picked) {
            setSearchParams({ focus: picked });
        }
    }, [picked, setSearchParams]);

    return (
        <section className="apage">
            <header className="apage__header">
                <div>
                    <div className="apage__kicker">Analys</div>
                    <h1 className="apage__title">Prishistorik</h1>
                    <p className="apage__sub">Jämför marknadspris mot ert pris över tid</p>
                </div>
            </header>

            <div className="apage__body">
                <div className="card">
                    <div className="card-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <Input
                            value={ean}
                            onChange={(e) => setEan(e.target.value)}
                            placeholder="EAN (t.ex. 0193808111600)"
                            style={{ width: 360, maxWidth: "100%" }}
                        />
                        <Button
                            onClick={() => setPicked(String(ean).trim())}
                            disabled={!String(ean).trim()}
                        >
                            Visa
                        </Button>

                        {recent.length > 0 && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ color: "var(--muted2)", fontSize: 13 }}>Senaste:</span>
                                {recent.map((r) => (
                                    <Button
                                        key={r}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setEan(r);
                                            setPicked(r);
                                        }}
                                    >
                                        {r}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {picked && (
                    <PriceHistory
                        fetchJson={api.request.bind(api)}
                        ean={picked}
                        title="Prishistorik"
                    />
                )}
            </div>
        </section>
    );
}