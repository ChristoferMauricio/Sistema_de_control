/**
 * @file dashboard/layout.js - Layout principal del dashboard
 * @description Layout que envuelve todas las páginas bajo la ruta /dashboard.
 *              Se encarga de:
 *              1. Verificar que el usuario esté autenticado (redirige a /login si no lo está)
 *              2. Obtener el rol del usuario desde la tabla "team_roles" de Supabase
 *              3. Proveer el contexto de rol (RoleProvider) y tema (ThemeProvider)
 *              4. Renderizar la barra de navegación lateral (DashboardNav)
 *              5. Escuchar cambios de autenticación en tiempo real (cierre de sesión)
 *
 * Estrategia de obtención de rol:
 * - Primero intenta buscar por user_id en la tabla team_roles
 * - Si falla, hace un fallback buscando por email
 * - Si ambos fallan, asigna el rol "viewer" por defecto
 *
 * @route /dashboard/*
 * @requires supabase - Cliente de Supabase para autenticación y consulta de roles
 * @requires DashboardNav - Componente de navegación lateral
 * @requires RoleProvider - Contexto que provee el rol del usuario
 * @requires ThemeProvider - Contexto que provee el tema visual (claro/oscuro)
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNav from "@/components/DashboardNav";
import { RoleProvider } from "./RoleContext";
import { ThemeProvider } from "./ThemeContext";

/**
 * Layout del dashboard con autenticación, resolución de rol y navegación.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Página actual dentro del dashboard
 * @returns {JSX.Element} Layout con sidebar + contenido principal, o spinner de carga
 */
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);       // Datos del usuario autenticado
  const [role, setRole] = useState(null);        // Rol del usuario (admin, developer, qa, viewer)
  const [loading, setLoading] = useState(true);  // Estado de carga inicial

  useEffect(() => {
    /**
     * Verifica la sesión activa y obtiene el rol del usuario.
     * Si no hay sesión, redirige al login.
     */
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();

      // Sin sesión activa → redirigir al login
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      /* ─── Resolución del rol del usuario ─── */
      // Intento 1: buscar rol por user_id en la tabla team_roles
      const { data: roleData, error: roleError } = await supabase
        .from("team_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (roleError) {
        console.warn("Error obteniendo rol por user_id:", roleError.message);
        // Intento 2 (fallback): buscar rol por email
        const { data: roleByEmail } = await supabase
          .from("team_roles")
          .select("role")
          .eq("email", session.user.email)
          .single();

        if (roleByEmail) {
          console.log("Rol encontrado por email:", roleByEmail.role);
          setRole(roleByEmail.role);
        } else {
          // Ningún método encontró rol → asignar "viewer" por defecto
          console.warn("No se encontró rol para:", session.user.email);
          setRole("viewer");
        }
      } else {
        setRole(roleData?.role || "viewer");
      }

      setLoading(false);
    }

    checkSession();

    /* ─── Listener de cambios de autenticación en tiempo real ─── */
    // Si el usuario cierra sesión (desde otra pestaña, por ejemplo), redirige al login
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          router.replace("/login");
        }
      }
    );

    // Limpieza: desuscribirse al desmontar el componente
    return () => subscription?.unsubscribe();
  }, [router]);

  /* ─── Estado de carga: spinner mientras se verifica sesión y rol ─── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  /* ─── Estructura principal del dashboard ─── */
  return (
    <ThemeProvider>
      <RoleProvider role={role}>
        <div className="min-h-screen flex bg-gray-50">
          {/* Barra de navegación lateral (sidebar) */}
          <DashboardNav user={user} role={role} />

          {/* Contenido principal: se desplaza a la derecha del sidebar en pantallas grandes */}
          <main className="flex-1 lg:ml-72 min-h-screen">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </RoleProvider>
    </ThemeProvider>
  );
}
