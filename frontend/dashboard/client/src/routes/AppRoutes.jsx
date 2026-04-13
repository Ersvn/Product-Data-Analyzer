import { Routes, Route } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import OverviewPage from "../pages/OverviewPage";
import ProductsPage from "../pages/ProductsPage";
import NotFoundPage from "../pages/NotFoundPage";

function withShell(page) {
    return <AppShell>{page}</AppShell>;
}

export default function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={withShell(<OverviewPage />)} />
            <Route path="/products" element={withShell(<ProductsPage />)} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}