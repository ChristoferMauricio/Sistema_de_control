/**
 * @file obs/page.js - Página de observaciones del supervisor
 * @description Muestra todas las observaciones y comentarios registrados en los tickets de Jira.
 *              Solo muestra tickets que tienen un campo "comentario" no vacío.
 *              Los datos se obtienen en paralelo:
 *              - jira_tickets: tickets con comentarios (filtrados en la consulta)
 *              - Nombres: tabla de mapeo para resolución de nombres de programadores
 *
 * @route /dashboard/obs
 * @requires supabase - Cliente de Supabase para consultar tickets y nombres
 * @requires ObsTable - Componente de tabla especializado en observaciones
 */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ObsTable from "@/components/ObsTable";

/**
 * Componente de página que muestra las observaciones del supervisor sobre tickets.
 *
 * @returns {JSX.Element} Tabla de observaciones, estado de carga o mensaje de error
 *
 * Estados locales:
 * - tickets: Array de tickets que tienen comentarios/observaciones
 * - nombresData: Array de mapeo Nombre ↔ Programador para resolución de nombres
 * - loading: Estado de carga
 * - error: Mensaje de error si falla la consulta
 */
export default function ObservacionesSupervisorPage() {
  const [tickets, setTickets] = useState([]);
  const [nombresData, setNombresData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    /**
     * Obtiene en paralelo los tickets con comentarios y la tabla de nombres.
     * Filtra doblemente: en la consulta SQL (not null, not empty) y en JS (trim > 0).
     */
    async function fetchData() {
      try {
        setLoading(true);

        // Consultas en paralelo para optimizar tiempo de carga
        const [ticketsRes, nombresRes] = await Promise.all([
          // Obtener solo tickets que tienen comentario no nulo y no vacío
          supabase
            .from("jira_tickets")
            .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario")
            .not("comentario", "is", null)
            .neq("comentario", ""),
          // Tabla de nombres para resolución de emails a nombres completos
          supabase
            .from("Nombres")
            .select("Nombre, Programador")
        ]);

        if (ticketsRes.error) throw ticketsRes.error;
        if (nombresRes.error) throw nombresRes.error;

        // Filtro adicional en JS: asegurar que el comentario no sea solo espacios en blanco
        const validTickets = ticketsRes.data || [];
        const filteredTickets = validTickets.filter((t) => t.comentario && t.comentario.trim().length > 0);

        setTickets(filteredTickets);
        setNombresData(nombresRes.data || []);
      } catch (err) {
        console.error("Error fetching observaciones data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <div className="skeleton h-8 w-64 mb-2" />
            <div className="skeleton h-5 w-96" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto p-6 text-red-500">
        Error cargando datos: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Observaciones del Supervisor
          </h1>
          <p className="text-gray-500 mt-1">
            Revisión de todas las observaciones y comentarios registrados en los tickets.
          </p>
        </div>

        <div className="glass rounded-2xl shadow-sm border border-gray-200 overflow-hidden bg-white">
          <ObsTable 
            tickets={tickets} 
            nombresData={nombresData} 
          />
        </div>
      </div>
    </div>
  );
}
