/**
 * @file errores-certificacion/page.js - Página de errores en fase de certificación
 * @description Muestra los bugs/errores del tablero PF3QA (Sprint 2) cuyas historias
 *              vinculadas pertenecen a las iteraciones de certificación (F3.01 y F3.02).
 *
 *              Flujo de datos:
 *              1. Consulta bugs tipo Error/Bug del proyecto PF3QA en Sprint 2
 *              2. Obtiene los vínculos (links) entre bugs y tickets PF3 desde jira_ticket_links
 *              3. Consulta los sprints de los tickets vinculados (historias de PF3)
 *              4. Filtra solo los bugs cuyas historias vinculadas contienen "F3.01" o "F3.02"
 *              5. Adjunta el sprint de la historia vinculada para mostrarlo en la tabla
 *
 * @route /dashboard/errores-certificacion
 * @requires supabase - Cliente de Supabase para consultar tickets y vínculos
 * @requires TicketTable - Componente de tabla reutilizable para mostrar tickets
 */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";

/**
 * Componente de página que muestra errores clasificados como "de certificación".
 * Un error pertenece a certificación si sus tickets vinculados están en sprints F3.01 o F3.02.
 *
 * @returns {JSX.Element} Tabla de errores en certificación con banner de conteo
 */
export default function ErroresCertificacionPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /**
     * Obtiene y clasifica los errores de certificación mediante un flujo
     * de múltiples consultas encadenadas a Supabase.
     */
    async function fetchTickets() {
      // Paso 1: Obtener todos los bugs del tablero PF3QA en Sprint 2 activo
      const { data: bugsQA, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority")
        .in("issue_type", ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"])
        .like("jira_key", "PF3QA-%")
        .eq("sprint", "Tablero Sprint 2")
        .order("updated_at", { ascending: false });

      if (!error && bugsQA && bugsQA.length > 0) {
        const bugKeys = bugsQA.map(b => b.jira_key);

        // Paso 2: Obtener vínculos (relaciones) entre bugs y otros tickets desde la tabla normalizada
        const { data: linkRows } = await supabase
          .from("jira_ticket_links")
          .select("source_key, target_key")
          .in("source_key", bugKeys);

        // Construir mapa: clave del bug → [claves de tickets vinculados]
        const linksMap = {};
        for (const row of linkRows || []) {
          if (!linksMap[row.source_key]) linksMap[row.source_key] = [];
          linksMap[row.source_key].push(row.target_key);
        }

        // Paso 3: Consultar los sprints de los tickets vinculados (historias PF3)
        const allTargetKeys = Array.from(new Set(Object.values(linksMap).flat()));
        const linkedStoriesMap = {};
        if (allTargetKeys.length > 0) {
          const { data: linkedStories } = await supabase
            .from("jira_tickets")
            .select("jira_key, sprint")
            .in("jira_key", allTargetKeys);
          (linkedStories || []).forEach(st => {
            linkedStoriesMap[st.jira_key] = st.sprint || "";
          });
        }

        // Paso 4: Filtrar solo bugs cuyas historias vinculadas pertenecen a certificación
        // Certificación = sprints que contienen "F3.01" (Sprint 1) o "F3.02" (Sprint 2)
        const certBugs = bugsQA.filter(bug => {
          const targets = linksMap[bug.jira_key] || [];
          return targets.some(tk => {
            const sprint = linkedStoriesMap[tk] || "";
            return sprint.includes("F3.01") || sprint.includes("F3.02");
          });
        });

        // Paso 5: Adjuntar el sprint de la historia vinculada (storySprint) a cada bug
        // para mostrarlo como columna adicional en la tabla
        const updatedTickets = certBugs.map(b => {
          const targets = linksMap[b.jira_key] || [];
          const sprints = [...new Set(targets.map(tk => linkedStoriesMap[tk]).filter(Boolean))];
          return { ...b, storySprint: sprints.join(", ") || "—" };
        });

        setTickets(updatedTickets);
      }
      setLoading(false);
    }

    fetchTickets();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-5 w-80" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-purple-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Errores de Certificación
          </h1>
        </div>
        <p className="text-gray-500 mt-2">
          Errores Sprint 2 cuyas historias vinculadas pertenecen a Sprint 1 o Sprint 2
        </p>
      </div>

      {/* Stats banner */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 animate-fade-in shadow-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
        <span className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{tickets.length}</span> ticket{tickets.length !== 1 ? "s" : ""} en certificación
        </span>
      </div>

      {/* Table */}
      <TicketTable tickets={tickets} title="Tickets en Certificación" mode="errores" />
    </div>
  );
}
