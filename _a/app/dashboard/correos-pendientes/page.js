/**
 * @file correos-pendientes/page.js - Página del módulo "Correos pendientes"
 * @description Tablero de recuadros con imágenes de correos pendientes de atención.
 *              Cada recuadro permite pegar una imagen con Ctrl+V (como el buscador
 *              de imágenes de Google), arrastrarla o subirla con clic; tiene un
 *              título editable y un historial de trazabilidad que registra cada
 *              reemplazo de imagen (las versiones anteriores se conservan).
 *
 * @route /dashboard/correos-pendientes
 * @requires CorreosPendientesBoard - Componente del tablero de recuadros
 * @requires useRole - Hook para obtener el rol del usuario
 */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CorreosPendientesBoard from "@/components/CorreosPendientesBoard";
import { useRole } from "../RoleContext";

export default function CorreosPendientesPage() {
  const { role, loading: roleLoading } = useRole();
  const [userEmail, setUserEmail] = useState(null);

  // Obtener el email del usuario autenticado (se registra en la trazabilidad)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data?.user?.email || null);
    });
  }, []);

  if (roleLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 transition-colors">
          Correos pendientes
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">
          Pega (Ctrl+V), arrastra o sube las capturas de correos pendientes. Cada recuadro guarda la trazabilidad de sus imágenes.
        </p>
      </div>

      {/* Tablero */}
      <CorreosPendientesBoard userEmail={userEmail} />
    </div>
  );
}
