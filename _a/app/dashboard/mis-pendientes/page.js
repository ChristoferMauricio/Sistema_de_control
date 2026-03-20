/**
 * @file mis-pendientes/page.js - Página de tickets asignados al usuario actual
 * @description Muestra los tickets de Jira asignados al usuario autenticado.
 *              Ofrece dos modos de visualización:
 *              - Vista Kanban: tablero con tres columnas (Pendiente, En curso, Realizado)
 *              - Vista Lista: tabla tradicional reutilizando el componente TicketTable
 *
 *              Los tickets se filtran por el email del usuario autenticado.
 *              Si no hay tickets asignados, muestra un mensaje de "sin pendientes".
 *
 * @route /dashboard/mis-pendientes
 * @requires supabase - Cliente de Supabase para autenticación y consulta de tickets
 * @requires TicketTable - Componente de tabla para la vista lista
 */
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";

/**
 * Mapeo de estados de Jira a las tres columnas del tablero Kanban.
 * Cada columna agrupa varios estados posibles de Jira.
 * @type {Object.<string, string[]>}
 */
const KANBAN_MAP = {
  Pendiente: ["Tareas por hacer", "POR HACER", "LISTO PARA DEV"],
  "En curso": ["En curso", "Control de calidad", "QA EN DEV"],
  Realizado: ["Finalizada", "LISTO (PASE A CERT)"],
};

/** Estilos CSS para cada columna del Kanban (header, indicador, badge, estado vacío) */
const KANBAN_STYLES = {
  Pendiente: {
    header: "bg-gray-50 border-gray-200",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    empty: "border-gray-200",
  },
  "En curso": {
    header: "bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    empty: "border-blue-200",
  },
  Realizado: {
    header: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    empty: "border-emerald-200",
  },
};

/**
 * Determina a qué columna Kanban pertenece un ticket según su estado de Jira.
 * @param {string} jiraStatus - Estado del ticket en Jira
 * @returns {string} Nombre de la columna Kanban ("Pendiente" | "En curso" | "Realizado")
 */
function getKanbanColumn(jiraStatus) {
  for (const [col, statuses] of Object.entries(KANBAN_MAP)) {
    if (statuses.includes(jiraStatus)) return col;
  }
  return "Pendiente";
}

/**
 * Tarjeta individual del tablero Kanban que muestra un ticket.
 * Incluye: tipo de ticket, clave Jira, resumen, sprint y story points.
 *
 * @param {Object} props
 * @param {Object} props.ticket - Datos del ticket de Jira
 * @returns {JSX.Element} Tarjeta con información del ticket
 */
function KanbanCard({ ticket }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-orange-300 p-4 shadow-sm hover:shadow-md transition-all">
      {/* Tipo + Key */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
          {ticket.issue_type || "Ticket"}
        </span>
        <span className="text-xs font-mono text-orange-600 font-bold">{ticket.jira_key}</span>
      </div>

      {/* Resumen */}
      <p className="text-sm text-gray-800 font-medium leading-snug mb-3 line-clamp-3">
        {ticket.summary}
      </p>

      {/* Footer */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ticket.sprint && (
          <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded truncate max-w-[160px]">
            {ticket.sprint}
          </span>
        )}
        {ticket.story_points != null && (
          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded ml-auto">
            {ticket.story_points} SP
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Tablero Kanban completo con tres columnas (Pendiente, En curso, Realizado).
 * Clasifica automáticamente los tickets en columnas según su estado de Jira.
 *
 * @param {Object} props
 * @param {Array} props.tickets - Array de tickets a distribuir en columnas
 * @returns {JSX.Element} Grid de tres columnas con tarjetas Kanban
 */
function KanbanBoard({ tickets }) {
  const columns = { Pendiente: [], "En curso": [], Realizado: [] };
  tickets.forEach((t) => { columns[getKanbanColumn(t.status)].push(t); });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
      {Object.entries(columns).map(([colName, colTickets]) => {
        const style = KANBAN_STYLES[colName];
        return (
          <div key={colName} className="flex flex-col gap-3">
            {/* Cabecera de columna */}
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${style.header}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className="text-sm font-semibold text-gray-800">{colName}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.badge}`}>
                {colTickets.length}
              </span>
            </div>

            {/* Tarjetas */}
            <div className="flex flex-col gap-2.5">
              {colTickets.length === 0 ? (
                <div className={`text-center py-10 text-sm text-gray-400 border-2 border-dashed ${style.empty} rounded-xl`}>
                  Sin tickets
                </div>
              ) : (
                colTickets.map((t) => <KanbanCard key={t.jira_key} ticket={t} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Componente principal de la página "Mis Pendientes".
 * Obtiene los tickets asignados al usuario autenticado y los muestra
 * en vista Kanban (por defecto) o vista Lista.
 *
 * @returns {JSX.Element} Página con toggle de vista y tickets del usuario
 */
export default function MisPendientesPage() {
  const [tickets, setTickets] = useState([]);       // Tickets asignados al usuario
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");    // Email del usuario autenticado
  const [viewMode, setViewMode] = useState("kanban"); // "kanban" o "lista"

  useEffect(() => {
    /**
     * Obtiene la sesión del usuario y consulta sus tickets asignados.
     * Filtra por assignee_email para mostrar solo los tickets del usuario actual.
     */
    async function fetchMyTickets() {
      // Obtener email del usuario autenticado
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email || "";
      setUserEmail(email);

      // Consultar tickets asignados al usuario actual
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_name, assignee_email, reporter_name, reporter_email, parent_key, subtask_keys, linked_keys, created_at, updated_at, comentario, priority")
        .eq("assignee_email", email)
        .order("updated_at", { ascending: false });

      if (!error && data) setTickets(data);
      setLoading(false);
    }
    fetchMyTickets();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-5 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-10 w-full rounded-xl" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="skeleton h-28 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Mis Pendientes
          </h1>
          <p className="text-gray-500 mt-1">
            Tickets asignados a{" "}
            <span className="text-orange-600 font-medium">{userEmail}</span>
          </p>
        </div>

        {/* Toggle de vista */}
        {tickets.length > 0 && (
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 self-start">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "kanban"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Kanban
            </button>
            <button
              onClick={() => setViewMode("lista")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === "lista"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              Lista
            </button>
          </div>
        )}
      </div>

      {/* Sin pendientes */}
      {tickets.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center animate-fade-in shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">¡Sin pendientes!</h3>
          <p className="text-gray-500 text-sm">No tienes tickets asignados en este momento.</p>
        </div>
      )}

      {/* Contenido: Kanban o Lista */}
      {tickets.length > 0 && (
        viewMode === "kanban"
          ? <KanbanBoard tickets={tickets} />
          : <TicketTable tickets={tickets} title="Mis Tickets Asignados" showAssignee={false} />
      )}
    </div>
  );
}
