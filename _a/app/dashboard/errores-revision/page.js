/**
 * @file errores-revision/page.js - Página de Revisión QA y Excluidos
 * @description Muestra los tickets PF3QA que no pudieron clasificarse
 *              como certificación ni desarrollo, más los excluidos (prueba/revisión).
 *
 * @route /dashboard/errores-revision
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresRevisionPage() {
  const [revisionTickets, setRevisionTickets] = useState([]);
  const [excluidosTickets, setExcluidosTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAndClassify();
      setRevisionTickets(result.revision);
      setExcluidosTickets(result.excluidos || []);
      setSprints(result.sprints);
      if (result.defaultSprint) setFilterSprint(result.defaultSprint);
      setLoading(false);
    }
    load();
  }, []);

  const filteredRevision = useMemo(() => {
    if (!filterSprint) return revisionTickets;
    return revisionTickets.filter((t) => t.sprint === filterSprint);
  }, [revisionTickets, filterSprint]);

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
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">
            Revisión QA
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Tickets PF3QA sin clasificación definida y tickets excluidos (prueba/revisión)
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
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredRevision.length}</span> sin clasificar
          </span>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredExcluidos.length}</span> excluido{filteredExcluidos.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tabla: Sin clasificar */}
      {filteredRevision.length > 0 && (
        <TicketTable tickets={filteredRevision} title="Tickets en Revisión QA" mode="errores" />
      )}

      {/* Tabla: Excluidos */}
      {filteredExcluidos.length > 0 && (
        <TicketTable tickets={filteredExcluidos} title="Tickets Excluidos (Prueba / Revisión)" mode="errores" />
      )}

      {filteredRevision.length === 0 && filteredExcluidos.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center text-gray-400 dark:text-gray-500">
          No hay tickets en esta categoría para el sprint seleccionado.
        </div>
      )}
    </div>
  );
}
