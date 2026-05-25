/**
 * @file DetailReviewTable.js
 * @description Componente principal del módulo "Revisión de Detalle de Historias".
 *   Analiza la calidad de la descripción de cada Historia de usuario y la clasifica
 *   en 4 categorías. Muestra:
 *     - 4 KPI cards con conteos por categoría (clicables para filtrar)
 *     - Gráfico de dona (donut chart) con distribución porcentual
 *     - Tabla detallada con todas las Historias y su clasificación
 *     - Exportación a Excel independiente con tabla dinámica
 *
 * @requires recharts - Para el gráfico de dona
 * @requires xlsx-js-style - Para la exportación a Excel
 * @requires classifyDetail - Lógica de clasificación de descripciones
 */
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download } from "lucide-react";
import { getCurrentSprint } from "@/lib/cronogramaData";
import { sortSprints, normalizeStatus } from "@/lib/utils";
import {
  classifyDescription,
  getPlainPreview,
  DETAIL_CATEGORIES,
  CATEGORY_MAP,
} from "@/lib/classifyDetail";
import Card from "@/components/ui/Card";

// ─── Constantes ─────────────────────────────────────────────────────────────

const JIRA_BASE = "https://supervisorservicio2020.atlassian.net/browse";
const PAGE_SIZE = 20;

/** Íconos SVG para cada categoría de detalle */
const CATEGORY_ICONS = {
  sin_detalle: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  detalle_insuficiente: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  solo_adjunto: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  ),
  detalle_adecuado: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

// ─── Componente Principal ───────────────────────────────────────────────────

/**
 * Tabla de revisión de detalle con KPIs, gráfico de dona, tabla y exportación.
 *
 * @param {Object} props
 * @param {Array}  props.tickets  - Todos los tickets Jira (ya incluyen `description`)
 */
export default function DetailReviewTable({ tickets = [] }) {
  // ── Estado ──────────────────────────────────────────────────────────────
  const [selectedSprint, setSelectedSprint] = useState(
    () => getCurrentSprint(new Date())?.iteracion || ""
  );
  const [categoryFilter, setCategoryFilter] = useState(null); // null = todas
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [showOnlyWithoutEpic, setShowOnlyWithoutEpic] = useState(false);
  const [hideNoReportar, setHideNoReportar] = useState(false);

  // Datos auxiliares para resolución de nombres
  const [persons, setPersons] = useState([]);
  const [equipo, setEquipo] = useState([]);

  // ── Cargar datos auxiliares para resolución de nombres ──────────────────
  useEffect(() => {
    Promise.all([
      supabase.from("jira_persons").select("email, display_name"),
      supabase.from("equipo_desarrollo").select("nombre, nombre_clave, correo_pgim, correo_gcorp"),
    ]).then(([personsRes, equipoRes]) => {
      if (personsRes.data) setPersons(personsRes.data);
      if (equipoRes.data) setEquipo(equipoRes.data);
    });
  }, []);

  // ── Sincronizar sprint con URL params ──────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sprintParam = params.get("sprint");
    if (sprintParam !== null) setSelectedSprint(sprintParam);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedSprint) params.set("sprint", selectedSprint);
    else params.delete("sprint");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [selectedSprint]);

  // ── Mapas de resolución de nombres ─────────────────────────────────────
  const equipoEmailMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.correo_pgim) map[m.correo_pgim.toLowerCase()] = m.nombre;
      if (m.correo_gcorp && m.correo_gcorp !== "-") map[m.correo_gcorp.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  const equipoKeyMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.nombre_clave && m.nombre_clave !== "-") map[m.nombre_clave.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => { if (p.email) map[p.email] = p.display_name; });
    return map;
  }, [persons]);

  const resolveName = useCallback((email) => {
    if (!email || email.trim() === "") return "Sin asignar";
    const byEmail = equipoEmailMap[email.toLowerCase()];
    if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
    const displayName = personsMap[email] || email;
    const resolved = equipoKeyMap[displayName.toLowerCase()] || displayName;
    return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
  }, [equipoEmailMap, equipoKeyMap, personsMap]);

  // ── Filtrar solo Historias ─────────────────────────────────────────────
  const historias = useMemo(() => {
    return tickets.filter(
      (t) => t.issue_type === "Historia" || t.issue_type === "Story"
    );
  }, [tickets]);

  // ── Sprints disponibles ────────────────────────────────────────────────
  const sprints = useMemo(() => {
    const s = new Set();
    historias.forEach((t) => { if (t.sprint) s.add(t.sprint); });
    return sortSprints([...s]);
  }, [historias]);

  // ── Clasificar todas las historias del proyecto (incluye sprints y backlog) ──
  const allClassifiedStories = useMemo(() => {
    return historias.map((t) => ({
      ...t,
      category: classifyDescription(t.description),
      assigneeName: resolveName(t.assignee_email),
      preview: getPlainPreview(t.description, 100),
      normalizedStatus: normalizeStatus(t.status),
    }));
  }, [historias, resolveName]);

  // ── Filtrar historias clasificados por el sprint seleccionado para la UI ──
  const classifiedStories = useMemo(() => {
    if (!selectedSprint) return allClassifiedStories;
    return allClassifiedStories.filter((t) => t.sprint === selectedSprint);
  }, [allClassifiedStories, selectedSprint]);

  // ── Historias sin Épica en el sprint activo ────────────────────────────
  const storiesWithoutEpic = useMemo(() => {
    return classifiedStories.filter((s) => !s.parent_key);
  }, [classifiedStories]);

  // ── Conteos por categoría ──────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts = {};
    DETAIL_CATEGORIES.forEach((c) => { counts[c.key] = 0; });
    classifiedStories.forEach((s) => { counts[s.category]++; });
    return counts;
  }, [classifiedStories]);

  // ── Datos para el gráfico de dona ──────────────────────────────────────
  const chartData = useMemo(() => {
    return DETAIL_CATEGORIES.map((c) => ({
      name: c.label,
      value: categoryCounts[c.key],
      color: c.chartColor,
    })).filter((d) => d.value > 0);
  }, [categoryCounts]);

  // ── Filtrar tabla por categoría, épica y búsqueda ─────────────────────
  const filteredStories = useMemo(() => {
    let result = classifiedStories;

    if (categoryFilter) {
      result = result.filter((s) => s.category === categoryFilter);
    }

    if (showOnlyWithoutEpic) {
      result = result.filter((s) => !s.parent_key);
    }

    if (hideNoReportar) {
      result = result.filter((s) => !s.labels || !s.labels.includes("No_Reportar"));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.jira_key.toLowerCase().includes(q) ||
          (s.summary || "").toLowerCase().includes(q) ||
          s.assigneeName.toLowerCase().includes(q) ||
          (s.labels || []).some((lbl) => lbl.toLowerCase().includes(q))
      );
    }

    return result;
  }, [classifiedStories, categoryFilter, showOnlyWithoutEpic, searchQuery]);

  // ── Paginación ─────────────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredStories.length / PAGE_SIZE);
  const paginatedStories = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStories.slice(start, start + PAGE_SIZE);
  }, [filteredStories, currentPage]);

  // Reset de página cuando cambian los filtros
  useEffect(() => { setCurrentPage(1); }, [categoryFilter, searchQuery, selectedSprint, showOnlyWithoutEpic, hideNoReportar]);

  // ── Porcentaje para KPI cards ──────────────────────────────────────────
  const total = classifiedStories.length;
  const getPercentage = (count) => (total > 0 ? ((count / total) * 100).toFixed(1) : "0.0");

  // ── Exportar a Excel ───────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { exportDetailExcel } = await import("@/lib/exportDetailExcel");
      await exportDetailExcel(allClassifiedStories, selectedSprint);
    } catch (err) {
      console.error("Error exportando Excel:", err);
      alert("Error al exportar el Excel. Revisa la consola para más detalles.");
    }
    setExporting(false);
  }, [allClassifiedStories, selectedSprint]);

  // ── Tooltip personalizado para el gráfico de dona ──────────────────────
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">{data.name}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            {data.value} historia{data.value !== 1 ? "s" : ""}{" "}
            <span className="text-gray-400">({getPercentage(data.value)}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // ── Renderizado ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Selector de Sprint ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Sprint:</label>
          <select
            id="sprint-filter-detail"
            value={selectedSprint}
            onChange={(e) => setSelectedSprint(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all min-w-[200px]"
          >
            <option value="">Todos los sprints</option>
            {sprints.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button
          id="export-detail-excel-btn"
          onClick={handleExport}
          disabled={exporting || classifiedStories.length === 0}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] ${
            exporting
              ? "bg-gray-100 text-gray-400 cursor-wait"
              : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/15"
          }`}
        >
          {exporting ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Exportar a Excel
            </>
          )}
        </button>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DETAIL_CATEGORIES.map((cat, index) => {
          const count = categoryCounts[cat.key];
          const isActive = categoryFilter === cat.key;
          return (
            <Card
              key={cat.key}
              hover
              className={`animate-slide-up stagger-${index + 1} cursor-pointer ${
                isActive ? `ring-2 ring-offset-1 ${cat.borderColor} ${cat.bgColor}` : ""
              }`}
              onClick={() =>
                setCategoryFilter(isActive ? null : cat.key)
              }
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">{cat.label}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
                      {count}
                    </span>
                    <span className={`text-sm font-semibold ${cat.color}`}>
                      {getPercentage(count)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                    {cat.description}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${cat.iconBg}`}>
                  <span className={cat.iconColor}>
                    {CATEGORY_ICONS[cat.key]}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Badge de filtro activo */}
      {categoryFilter && (
        <div className="flex items-center gap-2 animate-fade-in">
          <span className="text-sm text-gray-500">Filtrando por:</span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity ${
              CATEGORY_MAP[categoryFilter].bgColor
            } ${CATEGORY_MAP[categoryFilter].color} border ${CATEGORY_MAP[categoryFilter].borderColor}`}
            onClick={() => setCategoryFilter(null)}
          >
            <span className={`w-2 h-2 rounded-full ${CATEGORY_MAP[categoryFilter].dotColor}`} />
            {CATEGORY_MAP[categoryFilter].label}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      )}

      {/* ── Gráfico de Dona + Resumen ───────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dona */}
          <Card className="lg:col-span-1 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribución de Calidad</h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Leyenda manual */}
            <div className="space-y-2 mt-2">
              {DETAIL_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key];
                if (count === 0) return null;
                return (
                  <div key={cat.key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.chartColor }} />
                      <span className="text-gray-600">{cat.label}</span>
                    </div>
                    <span className="font-semibold text-gray-800">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Resumen de métricas */}
          <Card className="lg:col-span-2 animate-fade-in">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Resumen de Revisión</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              {/* Total de historias */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Historias</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">en {selectedSprint || "todos los sprints"}</p>
              </div>

              {/* Necesitan revisión */}
              <div className="bg-red-50 rounded-xl p-4 border border-red-100 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Necesitan Revisión</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">
                    {categoryCounts.sin_detalle + categoryCounts.detalle_insuficiente + categoryCounts.solo_adjunto}
                  </p>
                </div>
                <p className="text-xs text-red-500 mt-1">
                  {getPercentage(categoryCounts.sin_detalle + categoryCounts.detalle_insuficiente + categoryCounts.solo_adjunto)}% del total
                </p>
              </div>

              {/* Con buen detalle */}
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Con Buen Detalle</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{categoryCounts.detalle_adecuado}</p>
                </div>
                <p className="text-xs text-emerald-500 mt-1">{getPercentage(categoryCounts.detalle_adecuado)}% del total</p>
              </div>

              {/* Historias sin Épica */}
              <div
                className={`rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] ${
                  storiesWithoutEpic.length > 0
                    ? "bg-amber-50 border-amber-200 hover:bg-amber-100/50"
                    : "bg-gray-50 border-gray-100"
                } ${showOnlyWithoutEpic ? "ring-2 ring-amber-500 ring-offset-0" : ""}`}
                onClick={() => setShowOnlyWithoutEpic(!showOnlyWithoutEpic)}
                title="Haz clic para filtrar historias sin épica"
              >
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${
                    storiesWithoutEpic.length > 0 ? "text-amber-500" : "text-gray-400"
                  }`}>HUs sin Épica</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    storiesWithoutEpic.length > 0 ? "text-amber-700" : "text-gray-900"
                  }`}>{storiesWithoutEpic.length}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <span>{getPercentage(storiesWithoutEpic.length)}% del total</span>
                  {storiesWithoutEpic.length > 0 && <span className="text-[10px] animate-pulse">⚠️</span>}
                </p>
              </div>

              {/* Barra de progreso */}
              <div className="bg-white rounded-xl p-4 border border-gray-200 flex flex-col justify-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Completitud</p>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? (categoryCounts.detalle_adecuado / total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm font-bold text-gray-700 mt-2">
                  {getPercentage(categoryCounts.detalle_adecuado)}%
                  <span className="text-xs font-normal text-gray-400 ml-1">completado</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Tabla de Historias ───────────────────────────────────────────── */}
      <Card className="animate-slide-up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 font-[family-name:var(--font-heading)]">
            Historias del Sprint
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({filteredStories.length} resultado{filteredStories.length !== 1 ? "s" : ""})
            </span>
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Filtro sin épica */}
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">
              <input
                type="checkbox"
                checked={showOnlyWithoutEpic}
                onChange={(e) => setShowOnlyWithoutEpic(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 border-gray-300 focus:ring-orange-500 focus:ring-2 focus:ring-offset-0 accent-orange-500 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                Mostrar solo sin Épica {storiesWithoutEpic.length > 0 && <span className="text-[11px]">⚠️</span>}
              </span>
            </label>

            {/* Filtro No_Reportar */}
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-600 hover:text-orange-500 transition-colors">
              <input
                type="checkbox"
                checked={hideNoReportar}
                onChange={(e) => setHideNoReportar(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 border-gray-300 focus:ring-orange-500 focus:ring-2 focus:ring-offset-0 accent-orange-500 cursor-pointer"
              />
              <span className="flex items-center gap-1">
                Ocultar "No_Reportar" 🚫
              </span>
            </label>

            {/* Búsqueda */}
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                id="search-detail-review"
                type="text"
                placeholder="Buscar clave, resumen o asignado..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all w-full sm:w-[300px]"
              />
            </div>
          </div>
        </div>

        {filteredStories.length === 0 ? (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-400 mt-3 text-sm">No se encontraron historias con los filtros actuales.</p>
          </div>
        ) : (
          <>
            {/* Tabla */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Clave</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Asignado</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Épica</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoría</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Etiquetas</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Preview del Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedStories.map((story) => {
                    const cat = CATEGORY_MAP[story.category];
                    return (
                      <tr key={story.jira_key} className="hover:bg-gray-50/50 transition-colors group">
                        {/* Clave */}
                        <td className="py-3 px-3">
                          <a
                            href={`${JIRA_BASE}/${story.jira_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline text-[13px]"
                          >
                            {story.jira_key}
                          </a>
                        </td>

                        {/* Resumen */}
                        <td className="py-3 px-3 max-w-[300px]">
                          <span className="text-gray-800 leading-snug line-clamp-2">{story.summary}</span>
                        </td>

                        {/* Asignado */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-gray-700 text-[13px]">{story.assigneeName}</span>
                        </td>

                        {/* Estado */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-600">
                            {story.status}
                          </span>
                        </td>

                        {/* Épica */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {story.parent_key ? (
                            <a
                              href={`${JIRA_BASE}/${story.parent_key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline text-[12px]"
                            >
                              {story.parent_key}
                            </a>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠️ Sin Épica
                            </span>
                          )}
                        </td>

                        {/* Categoría */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${cat.bgColor} ${cat.color} border ${cat.borderColor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cat.dotColor}`} />
                            {cat.label}
                          </span>
                        </td>

                        {/* Etiquetas */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {story.labels && story.labels.length > 0 ? (
                              story.labels.map((lbl) => (
                                <span key={lbl} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                                  {lbl}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </div>
                        </td>

                        {/* Preview */}
                        <td className="py-3 px-3 max-w-[280px] hidden xl:table-cell">
                          <span className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                            {story.preview}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredStories.length)} de {filteredStories.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Anterior
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          currentPage === page
                            ? "bg-orange-500 text-white"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
