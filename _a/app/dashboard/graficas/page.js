/**
 * @file dashboard/graficas/page.js
 * @description Página de Gráficas del dashboard. Muestra visualizaciones de datos
 *   de los tickets sincronizados, comenzando con la gráfica de creación semanal.
 *
 * @route /dashboard/graficas
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import WeeklyCreationChart from "@/components/WeeklyCreationChart";
import EpicsDistributionChart from "@/components/EpicsDistributionChart";
import { getCurrentSprint } from "@/lib/cronogramaData";

export default function GraficasPage() {
  const [tickets, setTickets]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [currentSprint, setCurrentSprint] = useState(null);

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
      <div className="animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
          Gráficas
        </h1>
        <p className="text-gray-500 mt-1">
          Visualizaciones de los datos del proyecto — {tickets.length} tickets cargados
        </p>
      </div>

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
