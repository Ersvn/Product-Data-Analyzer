import { Routes, Route } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import OverviewPage from "../pages/OverviewPage";
import ProductsPage from "../pages/ProductsPage";
import ScraperPage from "../pages/ScraperPage";
import NotFoundPage from "../pages/NotFoundPage";

export default function AppRoutes() {
    return (
        <Routes>
            <Route
                path="/"
                element={
                    <AppShell>
                        <OverviewPage />
                    </AppShell>
                }
            />
            <Route
                path="/products"
                element={
                    <AppShell>
                        <ProductsPage />
                    </AppShell>
                }
            />
            <Route
                path="/scraper"
                element={
                    <AppShell>
                        <ScraperPage />
                    </AppShell>
                }
            />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}