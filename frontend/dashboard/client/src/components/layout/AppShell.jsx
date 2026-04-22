import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

const Icons = {
    overview: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    products: (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m7.5 4.27 9 5.15" />
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
        </svg>
    ),
};

const NAV_ITEMS = [
    { key: "overview", label: "Dashboard", path: "/" },
    { key: "products", label: "Products", path: "/products" },
];

export default function AppShell({ children }) {
    const { pathname } = useLocation();

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="sidebar__top">
                    <div className="logo">
                        <img
                            src="/product-images/logo.svg"
                            alt="Price Comparer logo"
                            className="logo__img"
                        />

                        <div className="logo__text">
                            <div className="logo__name">Price Comparer</div>
                            <div className="logo__sub">Ipsum Lorem</div>
                        </div>
                    </div>
                </div>

                <nav className="nav">
                    <div className="nav__group">
                        <div className="nav__groupTitle">Navigation</div>

                        <div className="nav__items">
                            {NAV_ITEMS.map((item) => {
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
                <main className="content">{children}</main>
            </div>
        </div>
    );
}
