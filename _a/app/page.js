/**
 * @file page.js - Página principal / punto de entrada de la aplicación
 * @description Página raíz ("/") que actúa como redirector automático.
 *              Verifica si el usuario tiene una sesión activa en Supabase:
 *              - Si está autenticado → redirige a /dashboard
 *              - Si no está autenticado → redirige a /login
 *              Mientras se verifica la sesión, muestra un spinner de carga.
 *
 * @requires supabase - Cliente de Supabase para verificar autenticación
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Componente de página principal que redirige según el estado de autenticación.
 * No renderiza contenido permanente, solo un indicador de carga temporal.
 *
 * @returns {JSX.Element} Spinner de carga mientras se verifica la sesión
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    /**
     * Verifica si existe una sesión activa en Supabase y redirige en consecuencia.
     * Usa router.replace() para evitar que el usuario vuelva a esta página con "atrás".
     */
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Usuario autenticado → ir al dashboard
        router.replace("/dashboard");
      } else {
        // Sin sesión → ir al login
        router.replace("/login");
      }
    }
    checkAuth();
  }, [router]);

  /* ─── Pantalla de carga mientras se verifica la autenticación ─── */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="w-12 h-12 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Cargando...</p>
      </div>
    </div>
  );
}
