/**
 * @file ThemeContext.js - Contexto global de tema (claro/oscuro)
 * @description Gestiona el tema visual de la aplicación (modo claro u oscuro)
 *              mediante React Context. Persiste la preferencia del usuario en
 *              localStorage bajo la clave "dashboard-theme".
 *              Al montar, lee la preferencia guardada y aplica la clase CSS "dark"
 *              al elemento <html> para activar los estilos de Tailwind CSS en modo oscuro.
 *
 * @example
 * // En un componente hijo:
 * import { useTheme } from "@/app/dashboard/ThemeContext";
 * const { theme, toggleTheme } = useTheme();
 * // theme = "light" | "dark"
 * // toggleTheme() alterna entre ambos modos
 */
"use client";

import { createContext, useContext, useState, useEffect } from "react";

/**
 * Contexto de React para el tema visual.
 * Valor por defecto: tema "light" con función toggleTheme vacía.
 */
const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

/**
 * Proveedor del contexto de tema. Envuelve los componentes del dashboard
 * para proveer acceso al tema actual y la función para alternarlo.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componentes hijos
 * @returns {JSX.Element|null} Proveedor del contexto, o null antes del montaje
 *                             (para evitar flash de tema incorrecto durante SSR)
 */
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState("light");
    /** Controla si el componente ya se montó en el cliente (evita hidratación incorrecta) */
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Leer preferencia guardada en localStorage al montar el componente
        const saved = localStorage.getItem("dashboard-theme") || "light";
        setTheme(saved);
        // Aplicar/remover la clase "dark" en <html> para activar estilos Tailwind dark mode
        document.documentElement.classList.toggle("dark", saved === "dark");
        setMounted(true);
    }, []);

    /**
     * Alterna entre tema claro y oscuro.
     * Actualiza el estado, persiste en localStorage y aplica la clase CSS "dark".
     */
    function toggleTheme() {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        localStorage.setItem("dashboard-theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
    }

    // Evitar flash de tema incorrecto durante la renderización del servidor (SSR)
    if (!mounted) return null;

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Hook personalizado para acceder al tema actual y la función para alternarlo.
 * Debe usarse dentro de un componente envuelto por ThemeProvider.
 *
 * @returns {{ theme: string, toggleTheme: Function }} Objeto con el tema actual y función toggle
 */
export function useTheme() {
    return useContext(ThemeContext);
}
