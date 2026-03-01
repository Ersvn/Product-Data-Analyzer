import { Routes, Route } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import OverviewPage from "../pages/OverviewPage";
import ProductsPage from "../pages/ProductsPage";
import HistoryPage from "../pages/HistoryPage";
import NotFoundPage from "../pages/NotFoundPage";
import LoginPage from "../pages/LoginPage";
import DbExplorerPage from "../pages/DbExplorerPage.jsx";

function Placeholder({ title }) {
    return (
        <div className="card" style={{ marginTop: 20 }}>
            <div className="card-pad" style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
                <h2 style={{ marginBottom: 8 }}>{title}</h2>
                <p style={{ color: 'var(--text-secondary)' }}>This function is being developed as we speak..</p>
            </div>
        </div>
    );
}

export default function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AppShell><OverviewPage /></AppShell>} />
            <Route path="/products" element={<AppShell><ProductsPage /></AppShell>} />
            <Route path="/history" element={<AppShell><HistoryPage /></AppShell>} />
            <Route path="/orders" element={<AppShell><Placeholder title="Orders" /></AppShell>} />
            <Route path="/users" element={<AppShell><Placeholder title="Users" /></AppShell>} />
            <Route path="*" element={<NotFoundPage />} />
            <Route path="/db" element={<DbExplorerPage />} />
        </Routes>
    );
}