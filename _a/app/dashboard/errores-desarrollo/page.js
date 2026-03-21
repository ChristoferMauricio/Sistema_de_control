/**
 * @file errores-desarrollo/page.js - Página de errores en fase de desarrollo
 * @description Muestra los tickets PF3QA (Historias + Errores) clasificados como desarrollo:
 *              - Épica PF3QA-50 (Desarrollo - Sprints: 3,4,5)
 *              - O actividad vinculada en sprint F3.03 / F3.4 / F3.5
 *
 * @route /dashboard/errores-desarrollo
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresDesarrolloPage() {
  const [allTickets, setAllTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAndClassify();
      setAllTickets(result.desarrollo);
      setSprints(result.sprints);
      if (result.defaultSprint) setFilterSprint(result.defaultSprint);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!filterSprint) return allTickets;
    return allTickets.filter((t) => t.sprint === filterSprint);
  }, [allTickets, filterSprint]);

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
          <div className="p-2 rounded-xl bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Errores de Desarrollo
          </h1>
        </div>
        <p className="text-gray-500 mt-2">
          Tickets con épica PF3QA-50 o actividad vinculada en Sprint 3-5
        </p>
      </div>

      {/* Sprint filter + Stats */}
      <div className="flex flex-wrap items-center gap-4 animate-fade-in">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-2 shadow-sm">
          <label className="text-xs text-gray-500 mr-2">Sprint:</label>
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="text-sm font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
          >
            <option value="">Todos</option>
            {sprints.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{filtered.length}</span> ticket{filtered.length !== 1 ? "s" : ""} en desarrollo
          </span>
        </div>
      </div>

      {/* Table */}
      <TicketTable tickets={filtered} title="Tickets en Desarrollo" mode="errores" />
    </div>
  );
}
