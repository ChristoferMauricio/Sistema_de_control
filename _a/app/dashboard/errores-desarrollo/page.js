/**
 * @file errores-desarrollo/page.js - Página de errores en fase de desarrollo
 * @description Muestra los tickets PF3QA (Historias + Errores) clasificados como desarrollo:
 *              - Épica PF3QA-50 (Desarrollo - Sprints: 3,4,5)
 *              - O actividad vinculada en sprint F3.03 / F3.4 / F3.5
 *
 * @route /dashboard/errores-desarrollo
 */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchAndClassify } from "@/lib/clasificarErrores";
import TicketTable from "@/components/TicketTable";

export default function ErroresDesarrolloPage() {
  const [allTickets, setAllTickets] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filterSprint, setFilterSprint] = useState("");
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const result = await fetchAndClassify();
    setAllTickets(result.desarrollo);
    setSprints(result.sprints);
    if (result.defaultSprint) setFilterSprint(result.defaultSprint);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync-jira", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setSyncResult({ type: "error", message: data.error || "Error al sincronizar" });
      } else {
        setSyncResult({
          type: "success",
          message: `${data.synced} tickets sincronizados, ${data.statusChanges} cambio(s) de estado${data.deleted ? `, ${data.deleted} eliminado(s)` : ""}`,
        });
        await load();
        router.refresh();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
    }

    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  }

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
              Errores de Desarrollo
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Tickets con épica PF3QA-50 o actividad vinculada en Sprint 3-5
            </p>
          </div>
        </div>

        <button
          id="sync-jira-btn"
          onClick={handleSync}
          disabled={syncing}
          className={`
            inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl
            font-medium text-sm transition-all duration-300 w-full sm:w-auto
            ${syncing
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait"
              : "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/15 hover:shadow-lg hover:shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98]"
            }
          `}
        >
          {syncing ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar desde Jira
            </>
          )}
        </button>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up
            ${syncResult.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50"
            }
          `}
        >
          {syncResult.type === "success" ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {syncResult.message}
        </div>
      )}

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
