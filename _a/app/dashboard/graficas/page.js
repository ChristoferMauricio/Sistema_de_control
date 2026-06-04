/**
 * @file dashboard/graficas/page.js
 * @description Página de Gráficas del dashboard. Muestra visualizaciones de datos
 *   de los tickets sincronizados, comenzando con la gráfica de creación semanal.
 *
 * @route /dashboard/graficas
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WeeklyCreationChart from "@/components/WeeklyCreationChart";
import EpicsDistributionChart from "@/components/EpicsDistributionChart";
import { getCurrentSprint } from "@/lib/cronogramaData";

export default function GraficasPage() {
  const [tickets, setTickets]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const router = useRouter();

  /* ─── Determinar sprint actual ─── */
  useEffect(() => {
    const cSprint = getCurrentSprint(new Date());
    setCurrentSprint(cSprint);
  }, []);

  /* ─── Cargar todos los tickets ─── */
  const fetchData = useCallback(async () => {
    let allData = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority, labels")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error || !data) { hasMore = false; break; }
      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    setTickets(allData);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        await fetchData();
        router.refresh();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
    }

    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Gráficas
          </h1>
          <p className="text-gray-500 mt-1">Visualizaciones de los datos del proyecto</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="skeleton h-6 w-48 mb-4" />
          <div className="skeleton h-80 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Gráficas
          </h1>
          <p className="text-gray-500 mt-1">
            Visualizaciones de los datos del proyecto — {tickets.length} tickets cargados
          </p>
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

      {/* Gráfica de creación semanal */}
      <WeeklyCreationChart
        tickets={tickets}
        currentSprint={currentSprint?.iteracion || ""}
      />

      {/* Gráfica de distribución de Épicas */}
      <EpicsDistributionChart 
        tickets={tickets}
        currentSprint={currentSprint?.iteracion || ""}
      />
    </div>
  );
}
