/**
 * @file hu-reportadas/page.js - Página del módulo de Historias Reportadas
 * @description Muestra las historias reportadas importadas del archivo Excel "Historias reportadas.xlsx".
 *              Soporta búsqueda por clave de historia y filtros por Sprint.
 *              Incluye KPIs y una acción para sincronizar directamente el archivo Excel.
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { sortSprints } from "@/lib/utils";

export default function HUReportadasPage() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSprint, setSelectedSprint] = useState("");

  // Estado de sincronización Excel
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Cargar datos
  async function fetchStories() {
    try {
      const { data, error } = await supabase
        .from("hu_reportadas")
        .select("*")
        .order("story_key", { ascending: true });

      if (error) throw error;
      setStories(data || []);
    } catch (err) {
      console.error("Error fetching HU reportadas:", err);
      setError("Error al cargar las historias reportadas. Asegúrate de ejecutar la migración SQL en Supabase.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStories();
  }, []);

  // Sincronizar Excel
  async function handleSyncExcel() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/import-hu-reportadas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ type: "error", message: data.error || "Error al importar el Excel" });
      } else {
        setSyncResult({ type: "success", message: data.message });
        // Recargar datos
        await fetchStories();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: `Error de red: ${err.message}` });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  }

  // Sprints únicos para el filtro
  const sprints = useMemo(() => {
    const set = new Set();
    stories.forEach((s) => {
      if (s.sprint) set.add(s.sprint);
    });
    return sortSprints([...set]);
  }, [stories]);

  // Filtrado
  const filteredStories = useMemo(() => {
    return stories.filter((s) => {
      const matchSearch =
        (s.story_key || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.story_summary || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.epic_key || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.epic_summary || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchSprint = selectedSprint ? s.sprint === selectedSprint : true;

      return matchSearch && matchSprint;
    });
  }, [stories, searchTerm, selectedSprint]);

  // KPIs
  const kpiTotalStories = filteredStories.length;
  const kpiTotalPoints = filteredStories.reduce((acc, curr) => acc + (Number(curr.story_points) || 0), 0);
  const kpiUniqueEpics = useMemo(() => {
    const epics = new Set();
    filteredStories.forEach((s) => {
      if (s.epic_key) epics.add(s.epic_key);
    });
    return epics.size;
  }, [filteredStories]);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-900/30 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="skeleton h-8 w-56 mb-2" />
              <div className="skeleton h-5 w-96" />
            </div>
            <div className="skeleton h-10 w-36" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="skeleton h-24 w-full rounded-2xl" />
            <div className="skeleton h-24 w-full rounded-2xl" />
            <div className="skeleton h-24 w-full rounded-2xl" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-900/30 p-6 flex items-center justify-center">
        <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-6 py-4 rounded-xl border border-red-200 dark:border-red-900/30 font-medium shadow-sm max-w-lg text-center">
          <p className="mb-4">{error}</p>
          <div className="bg-white dark:bg-gray-800 text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono select-all overflow-x-auto whitespace-pre">
{`CREATE TABLE public.hu_reportadas (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  epic_key text,
  epic_summary text,
  story_key text NOT NULL UNIQUE,
  story_summary text,
  story_points numeric,
  sprint text,
  nota text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hu_reportadas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_hu_reportadas_story_key ON public.hu_reportadas(story_key);`}
          </div>
          <p className="text-xs text-gray-500 mt-2">Copia y ejecuta este script SQL en el editor SQL de Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-900/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-orange-50 border border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/30 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">
                HU Reportadas
              </h1>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
              Registro histórico de historias de usuario reportadas importadas de Excel.
            </p>
          </div>

          <button
            onClick={handleSyncExcel}
            disabled={syncing}
            className={`
              inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
              font-medium text-sm transition-all duration-300 w-full md:w-auto shadow-sm
              ${syncing
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait"
                : "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/15 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
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
                Importar Excel
              </>
            )}
          </button>
        </div>

        {/* Sync Toast Result */}
        {syncResult && (
          <div
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up
              ${syncResult.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30"
                : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/30"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Historias Reportadas</p>
              <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 mt-1">{kpiTotalStories}</p>
            </div>
            <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 text-orange-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Puntos de Historia Totales</p>
              <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 mt-1">{kpiTotalPoints} SP</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/20 text-purple-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Épicas Relacionadas</p>
              <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 mt-1">{kpiUniqueEpics}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filters and Table Container */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-slide-up flex flex-col">
          {stories.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-gray-200 dark:text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Sin información</h3>
              <p className="text-gray-500 dark:text-gray-400">No se encontraron historias reportadas. Haz clic en "Importar Excel" para cargar la información.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative min-h-0 bg-white dark:bg-gray-800">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-[11px] text-gray-500 dark:text-gray-400 uppercase bg-gray-50/80 dark:bg-gray-700/50 sticky top-0 z-10 font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">Clave Historia</th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col gap-2">
                        <span>Resumen Historia</span>
                        <input
                          type="text"
                          placeholder="Buscar por palabra clave..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 font-normal normal-case text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs min-w-[240px]"
                        />
                      </div>
                    </th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">Puntos</th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">Clave Épica</th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">Resumen Épica</th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col gap-2">
                        <span>Sprint</span>
                        <select
                          value={selectedSprint}
                          onChange={(e) => setSelectedSprint(e.target.value)}
                          className="px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 font-normal normal-case text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs min-w-[120px]"
                        >
                          <option value="">Todos</option>
                          {sprints.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">Nota/Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-medium text-xs">
                  {filteredStories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-400 font-normal">
                        No hay historias reportadas que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredStories.map((story) => (
                      <tr key={story.id} className="hover:bg-orange-50/10 dark:hover:bg-orange-950/5 transition-colors">
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700 font-mono font-bold text-orange-600 dark:text-orange-400">
                          <a
                            href={`https://supervisorservicio2020.atlassian.net/browse/${story.story_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {story.story_key}
                          </a>
                        </td>
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700 text-gray-900 dark:text-gray-100 max-w-sm whitespace-normal truncate-2-lines">
                          {story.story_summary}
                        </td>
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700 text-center font-bold">
                          {story.story_points != null ? (
                            <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30">
                              {story.story_points}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700 font-mono text-gray-500">
                          {story.epic_key ? (
                            <a
                              href={`https://supervisorservicio2020.atlassian.net/browse/${story.epic_key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {story.epic_key}
                            </a>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700 text-gray-500 max-w-xs whitespace-normal truncate-2-lines">
                          {story.epic_summary || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 border-r border-gray-100 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-2 py-0.5 rounded font-mono text-xs border border-gray-200 dark:border-gray-700">
                            {story.sprint || "Sin iteración"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500 max-w-xs whitespace-normal">
                          {story.nota || <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="bg-gray-50 dark:bg-gray-700/20 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">
                  Mostrando <span className="text-gray-900 dark:text-gray-100 font-bold">{filteredStories.length}</span> de {stories.length} historias.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
