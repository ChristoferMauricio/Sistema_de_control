/**
 * @file reportes/page.js - Página de reportes y tablas dinámicas
 * @description Muestra tablas dinámicas y resúmenes de las historias de usuario agrupadas
 *              por integrante del equipo y estado. Incluye funcionalidad de sincronización
 *              con Jira y muestra la fecha de última actualización.
 *
 *              Datos que consume:
 *              - jira_tickets: Todos los tickets paginados (1000 por consulta)
 *              - Nombres: Tabla de mapeo nombre clave → nombre completo del programador
 *
 * @route /dashboard/reportes
 * @requires supabase - Cliente de Supabase para consultar tickets y nombres
 * @requires ReportesTable - Componente que renderiza las tablas dinámicas de reportes
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ReportesTable from "@/components/ReportesTable";

/**
 * Componente de página de reportes con tablas dinámicas de tickets por integrante.
 *
 * @returns {JSX.Element} Página con header, botón de sincronización y tabla de reportes
 *
 * Estados locales:
 * - tickets: Array con todos los tickets de Jira (paginados)
 * - nombres: Array con mapeo Nombre ↔ Programador para resolución de nombres
 * - loading: Estado de carga inicial
 * - syncing: Indica si la sincronización con Jira está en curso
 * - syncResult: Resultado de la última sincronización (éxito/error)
 */
export default function ReportesPage() {
    const [tickets, setTickets] = useState([]);
    const [nombres, setNombres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const router = useRouter();

    /**
     * Obtiene todos los tickets de Jira (con paginación) y la tabla de nombres.
     * Supabase tiene un límite de 1000 filas por consulta, por lo que se pagina.
     */
    const fetchData = useCallback(async () => {
        /* ─── Paginación de tickets ─── */
        let allData = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from("jira_tickets")
                .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, synced_at, comentario, priority, labels")
                .is("deleted_at", null)
                .order("updated_at", { ascending: false })
                .range(from, from + pageSize - 1);

            if (error || !data) { hasMore = false; break; }
            allData = [...allData, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
        }

        setTickets(allData);

        /* ─── Tabla de nombres: mapeo nombre clave → nombre completo ─── */
        const { data: nombresData } = await supabase
            .from("Nombres")
            .select("Nombre, Programador");
        if (nombresData) setNombres(nombresData);

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Sincroniza tickets con la API de Jira.
     * Muestra un toast temporal con el resultado (éxito o error).
     */
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
                // Refrescar datos y limpiar caché del router
                await fetchData();
                router.refresh();
            }
        } catch (err) {
            setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
        }

        setSyncing(false);
        setTimeout(() => setSyncResult(null), 5000);
    }

    /**
     * Calcula la fecha de última sincronización a partir del campo synced_at
     * de todos los tickets. Busca la fecha más reciente.
     * @returns {Date|null} Fecha de la última sincronización o null si no hay datos
     */
    const lastUpdated = useMemo(() => {
        if (tickets.length === 0) return null;
        let max = null;
        tickets.forEach((t) => {
            const d = t.synced_at ? new Date(t.synced_at) : null;
            if (d && (!max || d > max)) max = d;
        });
        return max;
    }, [tickets]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="skeleton h-8 w-48 mb-2" />
                    <div className="skeleton h-4 w-64" />
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="skeleton h-6 w-40 mb-4" />
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
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
                        Reportes
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Tablas dinámicas y resúmenes de las historias de usuario
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <div className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Última actualización: <strong className="text-gray-700">{lastUpdated.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })} {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</strong></span>
                        </div>
                    )}

                    <a
                        href="https://docs.google.com/spreadsheets/d/1E_pTVHtdWGZHSVHqjj2wLoLihvVnH4Sva6PD9RF03f4/edit?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        title="Abrir Google Sheets"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="8" y1="13" x2="16" y2="13" />
                            <line x1="8" y1="17" x2="16" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span className="hidden md:inline">Google Sheets</span>
                    </a>

                    <button
                        id="sync-jira-btn"
                        onClick={handleSync}
                        disabled={syncing}
                        className={`
                        inline-flex items-center gap-2.5 px-4 py-2 rounded-xl
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
                                <span className="hidden sm:inline">Sincronizando...</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="hidden sm:inline">Actualizar desde Jira</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="hidden md:inline">Volver a Vista General</span>
                        <span className="md:hidden">Volver</span>
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

            {/* Tabla 01: Historias por Integrante y Estado */}
            <ReportesTable tickets={tickets} nombres={nombres} />
        </div>
    );
}
