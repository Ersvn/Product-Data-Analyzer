import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

const Icons = {
    overview: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    products: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
        </svg>
    ),
    scraper: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 5 8 3 5 6l2 2" />
            <path d="M14 5l2-2 3 3-2 2" />
            <path d="M12 7v4" />
            <path d="M6 13h12" />
            <path d="M7 13v4a5 5 0 0 0 10 0v-4" />
            <path d="M9 13V9a3 3 0 0 1 6 0v4" />
        </svg>
    ),
};

export default function AppShell({ children }) {
    const { pathname } = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    const navItems = useMemo(
        () => [
            { key: "overview", label: "Dashboard", path: "/" },
            { key: "products", label: "Products", path: "/products" },
            { key: "scraper", label: "Scraper", path: "/scraper" },
        ],
        []
    );

    const currentLabel =
        navItems.find((item) => item.path === pathname)?.label || "Dashboard";

    return (
        <div className={cn("app-shell", sidebarOpen && "app-shell--sidebar-open")}>
            <div
                className="sidebar-backdrop"
                onClick={() => setSidebarOpen(false)}
                aria-hidden={!sidebarOpen}
            />

            <aside className="sidebar">
                <div className="sidebar__top">
                    <div className="logo">
                        <div className="logo__mark" />
                        <div className="logo__text">
                            <div className="logo__name">Price Comparer</div>
                            <div className="logo__sub">Student project</div>
                        </div>
                    </div>
                </div>

                <nav className="nav">
                    <div className="nav__group">
                        <div className="nav__groupTitle">Navigation</div>

                        <div className="nav__items">
                            {navItems.map((item) => {
                                const active = pathname === item.path;

                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={cn("nav__link", active && "nav__link--active")}
                                    >
                                        <span className="nav__icon">{Icons[item.key]}</span>
                                        <span className="nav__label">{item.label}</span>
                                        {active && <span className="nav__activePip" />}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </nav>
            </aside>

            <div className="main">
                <header className="topbar">
                    <div className="topbar__left">
                        <button
                            type="button"
                            className="icon-btn mobile-only"
                            onClick={() => setSidebarOpen((prev) => !prev)}
                            aria-label="Open navigation"
                        >
                            ☰
                        </button>

                        <div className="topbar__title">{currentLabel}</div>
                    </div>

                    <div className="topbar__right">
                        <div className="user-pill">
                            <div className="user-pill__name">Admin</div>
                        </div>
                    </div>
                </header>

                <main className="content">{children}</main>
            </div>
        </div>
    );
}