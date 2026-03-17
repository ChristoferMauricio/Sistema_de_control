"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";
import Card from "@/components/ui/Card";
import { getCurrentSprint, formatCronogramaDate } from "@/lib/cronogramaData";

export default function DashboardPage() {
  const [tickets, setTickets] = useState([]);
  const [statusHistory, setStatusHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const router = useRouter();
  const [stats, setStats] = useState({
    total: 0,
    pendientes: 0,
    certificacion: { porHacer: 0, enCurso: 0, finalizada: 0 },
    desarrollo: { porHacer: 0, enCurso: 0, finalizada: 0 },
  });

  // Sprint Widget State
  const [currentSprint, setCurrentSprint] = useState(null);
  const [daysLeft, setDaysLeft] = useState(null);

  useEffect(() => {
    // Calculamos el sprint actual
    const todayObject = new Date();
    // Usa un desfase en el constructor si necesitas simular un día específico (ej. new Date("2026-03-12T00:00:00"))
    const cSprint = getCurrentSprint(todayObject);
    setCurrentSprint(cSprint);

    if (cSprint && cSprint.fechaMaxima) {
        // Calculate days left to present deliverable
        const [y, m, d] = cSprint.fechaMaxima.split("-").map(Number);
        // Date de la fecha maxima al final del dia
        const maximaDate = new Date(y, m - 1, d, 23, 59, 59, 999);
        
        // Difference in milliseconds
        const diffMs = maximaDate - todayObject;
        // Convert to days
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        setDaysLeft(diffDays);
    } else {
        setDaysLeft(null);
    }
  }, []);

  const fetchData = useCallback(async () => {
    // Supabase limita a 1000 filas por query — paginar para traer todo
    let allData = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error || !data) {
        hasMore = false;
        break;
      }

      allData = [...allData, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    if (allData.length > 0) {
      setTickets(allData);

      const pf3Tickets = allData.filter(t => t.jira_key?.startsWith("PF3-"));

      // --- Errores classification via linked_keys ---
      const bugsQA = allData.filter(t =>
        ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"].includes(t.issue_type) &&
        t.jira_key?.startsWith("PF3QA-") &&
        t.sprint === "Tablero Sprint 2"
      );

      // Build a map of linked PF3 story sprints
      const linkedStoriesMap = {};
      const allLinkedKeys = Array.from(new Set(
        bugsQA.flatMap(bug => (Array.isArray(bug.linked_keys) ? bug.linked_keys : []))
      ));
      pf3Tickets
        .filter(t => allLinkedKeys.includes(t.jira_key))
        .forEach(t => { linkedStoriesMap[t.jira_key] = t.sprint || ""; });

      const certBugs = bugsQA.filter(bug => {
        const links = Array.isArray(bug.linked_keys) ? bug.linked_keys : [];
        return links.some(lk => {
          const s = linkedStoriesMap[lk] || "";
          return s.includes("F3.01") || s.includes("F3.02");
        });
      });

      const desBugs = bugsQA.filter(bug => {
        const links = Array.isArray(bug.linked_keys) ? bug.linked_keys : [];
        return links.some(lk => {
          const s = linkedStoriesMap[lk] || "";
          return s.includes("F3.03") || s.includes("F3.4") || s.includes("F3.5");
        });
      });

      const countStatuses = (arr) => {
        const porHacer = arr.filter(t => ["por hacer", "tareas por hacer", "to do", "abierto", "open"].includes((t.status || "").toLowerCase())).length;
        const enCurso = arr.filter(t => ["en curso", "in progress", "en progreso"].includes((t.status || "").toLowerCase())).length;
        const finalizada = arr.filter(t => ["terminada", "done", "cerrado", "resuelto", "finalizado", "finalizada", "cerrada"].includes((t.status || "").toLowerCase())).length;
        return { porHacer, enCurso, finalizada };
      };

      setStats({
        total: allData.length,
        pendientes: allData.filter(
          (t) => !["Done", "Cerrado", "Terminada"].some((s) => (t.status || "").includes(s))
        ).length,
        certificacion: countStatuses(certBugs),
        desarrollo: countStatuses(desBugs),
      });
    }

    // Fetch status history for all tickets
    const { data: historyData } = await supabase
      .from("jira_ticket_status_history")
      .select("*")
      .order("changed_at", { ascending: true });

    if (historyData) {
      const historyMap = {};
      for (const entry of historyData) {
        if (!historyMap[entry.jira_key]) {
          historyMap[entry.jira_key] = [];
        }
        historyMap[entry.jira_key].push(entry);
      }
      setStatusHistory(historyMap);
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

  const StatusCounters = ({ data }) => (
    <div className="flex items-center gap-2 lg:gap-3 mt-1.5 w-full">
      <div className="flex flex-col items-center flex-1">
        <span className="text-[1.35rem] font-bold font-[family-name:var(--font-heading)] text-gray-700 leading-none">{data.porHacer}</span>
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1 text-center whitespace-nowrap">Por hacer</span>
      </div>
      <div className="w-px h-7 bg-gray-200 rounded-full shrink-0"></div>
      <div className="flex flex-col items-center flex-1">
        <span className="text-[1.35rem] font-bold font-[family-name:var(--font-heading)] text-blue-600 leading-none">{data.enCurso}</span>
        <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mt-1 text-center whitespace-nowrap">En curso</span>
      </div>
      <div className="w-px h-7 bg-gray-200 rounded-full shrink-0"></div>
      <div className="flex flex-col items-center flex-1">
        <span className="text-[1.35rem] font-bold font-[family-name:var(--font-heading)] text-emerald-600 leading-none">{data.finalizada}</span>
        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">Finalizada</span>
      </div>
    </div>
  );

  const kpiCards = [
    {
      label: "Total Tickets",
      value: stats.total,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Pendientes",
      value: stats.pendientes,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Errores Certificación",
      value: <StatusCounters data={stats.certificacion} />,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Errores Desarrollo",
      value: <StatusCounters data={stats.desarrollo} />,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Vista General
          </h1>
          <p className="text-gray-500 mt-1">
            Resumen de todos los tickets sincronizados desde Jira
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="sync-jira-btn"
            onClick={handleSync}
            disabled={syncing}
            className={`
            inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl
            font-medium text-sm transition-all duration-300
            ${syncing
                ? "bg-gray-100 text-gray-400 cursor-wait"
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

          <button
            onClick={() => router.push("/dashboard/reportes")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Ver Reportes
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up
            ${syncResult.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
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

      {/* Widget de Sprint Actual */}
      {currentSprint && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-sm animate-fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600 shadow-sm border border-emerald-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-emerald-900 border-b-2 border-emerald-600/30 w-max pb-0.5">
                        {currentSprint.iteracion}
                    </h2>
                    <p className="text-sm font-medium text-emerald-700 mt-1.5 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Inició: {formatCronogramaDate(currentSprint.fechaInicio)} — Finaliza: {formatCronogramaDate(currentSprint.fechaFin)}
                    </p>
                </div>
            </div>

            {daysLeft !== null && (
                <div className="bg-white rounded-xl py-3 px-6 shadow-sm border border-emerald-100 flex flex-col items-center justify-center min-w-[140px] w-full md:w-auto mt-2 md:mt-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Entregable en</p>
                    <div className="flex items-baseline gap-1.5">
                        <span className={`text-3xl font-black ${daysLeft <= 3 ? "text-red-500" : daysLeft <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                            {daysLeft > 0 ? daysLeft : 0}
                        </span>
                        <span className="text-sm font-medium text-gray-500">días</span>
                    </div>
                </div>
            )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={kpi.label} hover className={`animate-slide-up stagger-${index + 1}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 w-full min-w-0 pr-2">
                <p className="text-gray-500 text-sm font-medium">{kpi.label}</p>
                {typeof kpi.value === "number" || typeof kpi.value === "string" ? (
                  <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 mt-1">
                    {kpi.value}
                  </p>
                ) : (
                  <div className="w-full">
                    {kpi.value}
                  </div>
                )}
              </div>
              <div className={`p-2.5 rounded-xl shrink-0 ${kpi.bg}`}>
                <span className={kpi.color}>{kpi.icon}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tickets Table */}
      <TicketTable tickets={tickets} title="Todos los Tickets" statusHistory={statusHistory} />
    </div>
  );
}
