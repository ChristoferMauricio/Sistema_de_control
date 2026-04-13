/**
 * @file errores-revision/page.js - Página de Tickets Excluidos
 * @description Muestra únicamente los tickets excluidos de las estadísticas
 *              (como Pruebas Unitarias y Revisión Cruzada).
 *
 * @route /dashboard/errores-revision
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresRevisionPage() {
  const [excluidosTickets, setExcluidosTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAndClassify();
      setExcluidosTickets(result.excluidos || []);
      setSprints(result.sprints);
      if (result.defaultSprint) setFilterSprint(result.defaultSprint);
      setLoading(false);
    }
    load();
  }, []);

  const filteredExcluidos = useMemo(() => {
    if (!filterSprint) return excluidosTickets;
    return excluidosTickets.filter((t) => t.sprint === filterSprint);
  }, [excluidosTickets, filterSprint]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="skeleton h-8 w-64 mb-2" /><div className="skeleton h-5 w-80" /></div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => (<div key={i} className="skeleton h-10 w-full" />))}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">
            Tickets Excluidos
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Muestra únicamente los tickets de actividades secundarias (Pruebas Unitarias, Revisión Cruzada).
        </p>
      </div>

      {/* Sprint filter + Stats */}
      <div className="flex flex-wrap items-center gap-4 animate-fade-in">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 shadow-sm">
          <label className="text-xs text-gray-500 dark:text-gray-400 mr-2">Sprint:</label>
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="text-sm font-medium text-gray-700 dark:text-gray-200 bg-transparent outline-none cursor-pointer"
          >
            <option value="">Todos</option>
            {sprints.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredExcluidos.length}</span> excluido{filteredExcluidos.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tabla: Excluidos */}
      {filteredExcluidos.length > 0 ? (
        <TicketTable tickets={filteredExcluidos} title="Tickets Excluidos" mode="errores" />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center text-gray-400 dark:text-gray-500">
          No hay tickets excluidos para el sprint seleccionado.
        </div>
      )}
    </div>
  );
}
