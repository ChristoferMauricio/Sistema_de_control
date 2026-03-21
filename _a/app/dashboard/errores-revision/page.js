/**
 * @file errores-revision/page.js - Página de Revisión QA
 * @description Muestra los tickets PF3QA (Historias + Errores) que no pudieron clasificarse
 *              como certificación ni desarrollo. Estos tickets no tienen:
 *              - Épica PF3QA-49 ni PF3QA-50
 *              - Ni actividad vinculada en sprints F3.01-F3.05
 *
 * @route /dashboard/errores-revision
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresRevisionPage() {
  const [allTickets, setAllTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAndClassify();
      setAllTickets(result.revision);
      setSprints(result.sprints);
      if (result.sprints.length > 0) setFilterSprint(result.sprints[0]);
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
          <div className="p-2 rounded-xl bg-amber-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Revisión QA
          </h1>
        </div>
        <p className="text-gray-500 mt-2">
          Tickets PF3QA sin clasificación definida (sin épica ni actividad vinculada identificable)
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
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{filtered.length}</span> ticket{filtered.length !== 1 ? "s" : ""} sin clasificar
          </span>
        </div>
      </div>

      {/* Table */}
      <TicketTable tickets={filtered} title="Tickets en Revisión QA" mode="errores" />
    </div>
  );
}
