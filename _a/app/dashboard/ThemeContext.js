"use client";

import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("dashboard-theme") || "light";
        setTheme(saved);
        document.documentElement.classList.toggle("dark", saved === "dark");
        setMounted(true);
    }, []);

    function toggleTheme() {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        localStorage.setItem("dashboard-theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
    }

    // Prevent flash of wrong theme
    if (!mounted) return null;

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
