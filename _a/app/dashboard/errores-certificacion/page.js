/**
 * @file errores-certificacion/page.js - Página de errores en fase de certificación
 * @description Muestra los tickets PF3QA (Historias + Errores) clasificados como certificación:
 *              - Épica PF3QA-49 (Certificación - Sprints: 1,2)
 *              - O actividad vinculada en sprint F3.01 / F3.02
 *
 * @route /dashboard/errores-certificacion
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresCertificacionPage() {
  const [allTickets, setAllTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAndClassify();
      setAllTickets(result.certificacion);
      setSprints(result.sprints);
      // Default: sprint más alto (primero en la lista ordenada descendente)
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
          Tickets con épica PF3QA-49 o actividad vinculada en Sprint 1-2
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
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{filtered.length}</span> ticket{filtered.length !== 1 ? "s" : ""} en certificación
          </span>
        </div>
      </div>

      {/* Table */}
      <TicketTable tickets={filtered} title="Tickets en Certificación" mode="errores" />
    </div>
  );
}
