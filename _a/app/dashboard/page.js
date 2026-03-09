"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";
import Card from "@/components/ui/Card";

export default function DashboardPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pendientes: 0,
    certificacion: 0,
    produccion: 0,
  });

  const fetchData = useCallback(async () => {
    const { data, error } = await supabase
      .from("jira_tickets")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setTickets(data);

      setStats({
        total: data.length,
        pendientes: data.filter(
          (t) => !["Done", "Cerrado"].some((s) => (t.status || "").includes(s))
        ).length,
        certificacion: data.filter((t) =>
          (t.status || "").toLowerCase().includes("certificaci")
        ).length,
        produccion: data.filter((t) =>
          (t.status || "").toLowerCase().includes("producci")
        ).length,
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sincronizar con Jira
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
          message: `${data.synced} tickets sincronizados, ${data.statusChanges} cambio(s) de estado`,
        });
        // Refrescar datos del dashboard
        await fetchData();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
    }

    setSyncing(false);

    // Ocultar notificación después de 5 segundos
    setTimeout(() => setSyncResult(null), 5000);
  }

  const kpiCards = [
    {
      label: "Total Tickets",
      value: stats.total,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: "text-blue-400",
      bg: "bg-blue-500/15",
    },
    {
      label: "Pendientes",
      value: stats.pendientes,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-amber-400",
      bg: "bg-amber-500/15",
    },
    {
      label: "En Certificación",
      value: stats.certificacion,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: "text-purple-400",
      bg: "bg-purple-500/15",
    },
    {
      label: "En Producción",
      value: stats.produccion,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      color: "text-red-400",
      bg: "bg-red-500/15",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass rounded-2xl p-6">
              <div className="skeleton h-5 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="skeleton h-6 w-32 mb-4" />
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
      {/* Header + Sync Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-foreground">
            Vista General
          </h1>
          <p className="text-secondary-text mt-1">
            Resumen de todos los tickets sincronizados desde Jira
          </p>
        </div>

        <button
          id="sync-jira-btn"
          onClick={handleSync}
          disabled={syncing}
          className={`
            inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl
            font-medium text-sm transition-all duration-300
            ${syncing
              ? "bg-white/5 text-muted cursor-wait"
              : "bg-primary/90 hover:bg-primary text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
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
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/15 text-red-400 border border-red-500/20"
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={kpi.label} hover className={`animate-slide-up stagger-${index + 1}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted text-sm font-medium">{kpi.label}</p>
                <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-foreground mt-1">
                  {kpi.value}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                <span className={kpi.color}>{kpi.icon}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tickets Table */}
      <TicketTable tickets={tickets} title="Todos los Tickets" />
    </div>
  );
}
