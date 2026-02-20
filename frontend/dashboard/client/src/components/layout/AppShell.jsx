import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import CommandPalette from "../features/search/CommandPalette";
import { useLocalStorage } from "../../hooks/useLocalStorage";
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
    history: (
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
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            <path d="M12 7v5l4 2" />
        </svg>
    ),
    orders: (
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
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    ),
    users: (
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),

    // Command palette icon (theme-aware via currentColor)
    palette: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect
                x="3"
                y="4"
                width="18"
                height="16"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.8"
            />
            <path
                d="M7 9h10M7 13h6M7 17h10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    ),
};

export default function AppShell({ children }) {
    const { pathname } = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarPinned, setSidebarPinned] = useLocalStorage("sidebarPinned", true);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [theme, setTheme] = useLocalStorage("theme", "light");

    const isDark = theme === "dark";

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    useEffect(() => {
        const onKey = (e) => {
            const tag = String(document.activeElement?.tagName || "").toLowerCase();
            const isTyping =
                tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === "k") {
                if (!isTyping) {
                    e.preventDefault();
                    setPaletteOpen(true);
                }
                return;
            }

            if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (!isTyping) {
                    e.preventDefault();
                    setPaletteOpen(true);
                }
                return;
            }

            if (e.key === "Escape") {
                setSidebarOpen(false);
                setPaletteOpen(false);
            }
        };

        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const navGroups = useMemo(
        () => [
            {
                title: "Översikt",
                items: [
                    { key: "overview", label: "Dashboard", path: "/" },
                    { key: "products", label: "Produkter", path: "/products" },
                    { key: "history", label: "Historik", path: "/history" },
                ],
            },
            {
                title: "Administration",
                items: [
                    { key: "orders", label: "Ordrar", path: "/orders" },
                    { key: "users", label: "Användare", path: "/users" },
                ],
            },
        ],
        []
    );

    const currentLabel =
        navGroups.flatMap((g) => g.items).find((n) => n.path === pathname)?.label || "Översikt";

    const paletteItems = useMemo(
        () =>
            navGroups.flatMap((g) =>
                g.items.map((i) => ({ ...i, group: g.title, icon: Icons[i.key] }))
            ),
        [navGroups]
    );

    const paletteActions = useMemo(
        () => [
            {
                label: isDark ? "Ljust läge" : "Mörkt läge",
                hint: "Tema",
                icon: isDark ? "☀️" : "🌙",
                onRun: () => setTheme(isDark ? "light" : "dark"),
            },
            { label: "Uppdatera", hint: "App", icon: "↻", onRun: () => window.location.reload() },
        ],
        [isDark, setTheme]
    );

    return (
        <div className={cn("app-shell", sidebarOpen && "app-shell--sidebar-open")}>
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />

            <aside className={cn("sidebar", sidebarPinned && "sidebar--pinned")}>
                <div className="sidebar__top">
                    <div className="logo">
                        <div className="logo__mark" />
                        <div className="logo__text">
                            <div className="logo__name">Price-Comparer</div>
                            <div className="logo__sub">Ipsum Lorem</div>
                        </div>
                    </div>
                </div>

                <nav className="nav">
                    {navGroups.map((group) => (
                        <div key={group.title} className="nav__group">
                            <div className="nav__groupTitle">{group.title}</div>
                            <div className="nav__items">
                                {group.items.map((item) => {
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
                    ))}
                </nav>

                <div className="sidebar__bottom">
                    {/* Light vs Dark toggle (keep your current empty segments approach) */}
                    <button
                        className={cn("ld-toggle", isDark && "ld-toggle--dark")}
                        onClick={() => setTheme(isDark ? "light" : "dark")}
                        aria-pressed={isDark}
                        title={isDark ? "Växla till ljust läge" : "Växla till mörkt läge"}
                    >
                        <span className="ld-toggle__seg" />
                        <span className="ld-toggle__seg" />
                        <span className="ld-toggle__thumb" aria-hidden="true">
              {isDark ? "🌙" : "☀️"}
            </span>
                    </button>
                </div>
            </aside>

            <div className="main">
                <header className="topbar">
                    <div className="topbar__left">
                        <div className="title">
                            <h1>{currentLabel}</h1>
                        </div>
                    </div>

                    <div className="topbar__right">
                        <button
                            className="iconBtn iconBtn--palette"
                            data-testid="palette-trigger"
                            onClick={() => setPaletteOpen(true)}
                            title="Command Palette (Ctrl+K)"
                            aria-label="Öppna command palette"
                        >
                            {Icons.palette}
                        </button>


                        <div className="user-chip">
                            <span className="user-chip__avatar">A</span>
                            <span>Admin</span>
                        </div>
                    </div>
                </header>

                <main className="content">{children}</main>
            </div>

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                items={paletteItems}
                actions={paletteActions}
            />
        </div>
    );
}
