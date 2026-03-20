/**
 * @file RoleContext.js - Contexto global de rol de usuario
 * @description Provee el rol del usuario autenticado (ej: "admin", "developer", "qa", "viewer")
 *              a todos los componentes hijos del dashboard mediante React Context.
 *              Esto permite que cualquier componente acceda al rol del usuario sin
 *              necesidad de pasar props manualmente (prop drilling).
 *
 * Roles disponibles:
 * - "admin"     → Acceso completo, puede sincronizar y gestionar todo
 * - "developer" → Ve sus tickets asignados, acceso limitado
 * - "qa"        → Similar a developer, enfocado en certificación
 * - "viewer"    → Rol por defecto, solo lectura
 *
 * @example
 * // En un componente hijo:
 * import { useRole } from "@/app/dashboard/RoleContext";
 * const role = useRole(); // "admin" | "developer" | "qa" | "viewer"
 */
"use client";

import { createContext, useContext } from "react";

/** Contexto de React para el rol del usuario. Valor por defecto: "viewer" (solo lectura) */
const RoleContext = createContext("viewer");

/**
 * Proveedor del contexto de rol. Envuelve los componentes del dashboard
 * para que puedan acceder al rol del usuario mediante useRole().
 *
 * @param {Object} props
 * @param {string} props.role - Rol del usuario autenticado
 * @param {React.ReactNode} props.children - Componentes hijos que tendrán acceso al rol
 * @returns {JSX.Element} Proveedor del contexto con el valor del rol
 */
export function RoleProvider({ role, children }) {
    return (
        <RoleContext.Provider value={role}>
            {children}
        </RoleContext.Provider>
    );
}

/**
 * Hook personalizado para obtener el rol del usuario actual.
 * Debe usarse dentro de un componente envuelto por RoleProvider.
 *
 * @returns {string} Rol del usuario ("admin" | "developer" | "qa" | "viewer")
 */
export function useRole() {
    return useContext(RoleContext);
}
