/**
 * @file WeeklyCreationChart.js
 * @description Gráfica de líneas que muestra la cantidad de tickets creados por semana.
 *   - Eje X: semanas (Lun–Dom), agrupando tickets por fecha de creación
 *   - Eje Y: cantidad de tickets en esa semana
 *   - Filtros: Sprint (por defecto el actual) y Tipo (Historia, Subtarea, Error — sin Épica)
 *   - Los puntos son clicables y abren un popup con los tickets de esa semana
 *
 *   Utiliza Recharts para el renderizado de la gráfica.
 */
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { sortSprints } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Obtiene el lunes (inicio de semana) de una fecha dada.
 * @param {Date} date
 * @returns {Date}
 */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // ajustar Domingo = 0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formatea un rango de semana "DD/MM – DD/MM"
 */
function formatWeekLabel(monday) {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(monday)} – ${fmt(sun)}`;
}

/**
 * Formatea fecha corta "DD/MM"
 */
function formatShort(monday) {
  return `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;
}

/** Tipos que se excluyen de la gráfica (Épicas) */
const EXCLUDED_TYPES = ["Epic", "Épica"];

/** Opciones de tipo para el filtro */
const TYPE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "Historia", label: "Historias" },
  { value: "Subtarea", label: "Subtareas" },
  { value: "Bug", label: "Errores (Bugs)" },
];

/** URL base de Jira para hipervínculos */
const JIRA_BASE_URL = "https://supervisorservicio2020.atlassian.net/browse";

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Gráfica de creación semanal de tickets.
 * @param {Object} props
 * @param {Array}  props.tickets       - Todos los tickets cargados
 * @param {string} props.currentSprint - Sprint actual detectado (para filtro por defecto)
 */
export default function WeeklyCreationChart({ tickets = [], currentSprint = "" }) {
  const [filterSprint, setFilterSprint] = useState(currentSprint);
  const [filterType, setFilterType]     = useState("Historia");
  const [popup, setPopup]               = useState(null); // { weekLabel, tickets }
  const [portalRoot, setPortalRoot]      = useState(null);

  // Obtener document.body para el portal (solo client-side)
  useEffect(() => { setPortalRoot(document.body); }, []);

  // ── Sprints únicos para el dropdown ─────────────────────────────────────
  const uniqueSprints = useMemo(() => {
    const sprints = [...new Set(tickets.map(t => t.sprint).filter(Boolean))];
    return sortSprints(sprints);
  }, [tickets]);

  // ── Filtrar tickets ─────────────────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      // Excluir épicas siempre
      const type = (t.issue_type || "").toLowerCase();
      if (EXCLUDED_TYPES.some(ex => type.includes(ex.toLowerCase()))) return false;

      // Filtro de sprint
      if (filterSprint && t.sprint !== filterSprint) return false;

      // Filtro de tipo
      if (filterType) {
        if (filterType === "Historia") {
          if (!type.includes("histori") && type !== "story") return false;
        } else if (filterType === "Subtarea") {
          if (!type.includes("subtare") && !type.includes("sub-task") && type !== "subtask") return false;
        } else if (filterType === "Bug") {
          if (!type.includes("bug") && !type.includes("error")) return false;
        }
      }

      return true;
    });
  }, [tickets, filterSprint, filterType]);

  // ── Agrupar por semana ──────────────────────────────────────────────────
  const { chartData, weekTicketsMap } = useMemo(() => {
    const weekMap = {}; // key: monday timestamp → { count, tickets }

    filteredTickets.forEach(ticket => {
      if (!ticket.created_at) return;
      const created = new Date(ticket.created_at);
      const monday = getMonday(created);
      const key = monday.getTime();

      if (!weekMap[key]) {
        weekMap[key] = { monday, count: 0, points: 0, tickets: [] };
      }
      weekMap[key].count++;
      weekMap[key].points += (parseFloat(ticket.story_points) || 0);
      weekMap[key].tickets.push(ticket);
    });

    // Ordenar por semana cronológicamente
    const sortedKeys = Object.keys(weekMap).map(Number).sort((a, b) => a - b);

    const data = sortedKeys.map(key => ({
      weekKey: key,
      weekLabel: formatWeekLabel(weekMap[key].monday),
      weekShort: formatShort(weekMap[key].monday),
      cantidad: weekMap[key].count,
      puntajes: Math.round(weekMap[key].points * 100) / 100,
    }));

    const tMap = {};
    sortedKeys.forEach(key => {
      tMap[key] = weekMap[key].tickets;
    });

    return { chartData: data, weekTicketsMap: tMap };
  }, [filteredTickets]);

  // ── Click en punto de la gráfica ────────────────────────────────────────
  const handleDotClick = useCallback((data) => {
    if (data && data.payload) {
      const { weekKey, weekLabel } = data.payload;
      const tks = weekTicketsMap[weekKey] || [];
      setPopup({ weekLabel, tickets: tks });
    }
  }, [weekTicketsMap]);

  // ── Custom dot con cursor pointer y etiqueta numérica ────────────────────
  const CustomDot = (props) => {
    const { cx, cy, payload, dataKey } = props;
    const isSP = dataKey === "puntajes";
    const val = isSP ? payload.puntajes : payload.cantidad;
    const color = isSP ? "#f97316" : "#3b82f6";
    
    // No mostrar el punto de Puntaje si es 0 y no es la gráfica de Bugs/Subtareas
    if (isSP && val === 0) return null;

    return (
      <g style={{ cursor: "pointer" }} onClick={() => handleDotClick({ payload })}>
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill={color}
          stroke="#fff"
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          fontWeight={700}
        >
          {val}
        </text>
      </g>
    );
  };

  // ── Custom active dot (hover) ───────────────────────────────────────────
  const CustomActiveDot = (props) => {
    const { cx, cy, payload, dataKey } = props;
    const isSP = dataKey === "puntajes";
    const color = isSP ? "#ea580c" : "#2563eb";
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={color}
        stroke="#fff"
        strokeWidth={3}
        style={{ cursor: "pointer", filter: `drop-shadow(0 0 4px ${color}60)` }}
        onClick={() => handleDotClick({ payload })}
      />
    );
  };

  // ── Custom Tooltip ──────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800">{d.weekLabel}</p>
        <p className="text-blue-600 font-bold text-lg mt-0.5">{d.cantidad} ticket{d.cantidad !== 1 ? "s" : ""}</p>
        {d.puntajes > 0 && <p className="text-orange-500 font-bold text-sm mt-0.5">{d.puntajes} SP asignados</p>}
        <p className="text-[11px] text-gray-400 mt-1">Clic en el punto para ver detalle</p>
      </div>
    );
  };

  // ── Tipo badge color ────────────────────────────────────────────────────
  const typeBadge = (issueType) => {
    const t = (issueType || "").toLowerCase();
    if (t.includes("histori") || t === "story") return { bg: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" };
    if (t.includes("bug") || t.includes("error")) return { bg: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" };
    if (t.includes("sub") || t === "subtask") return { bg: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" };
    return { bg: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible animate-fade-in">
      {/* Header + Filtros */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            Tickets creados por semana
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""} · {Math.round(chartData.reduce((acc, curr) => acc + curr.puntajes, 0) * 100) / 100} SP en {chartData.length} semana{chartData.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro Sprint */}
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className={`
              px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-blue-400/40
              ${filterSprint
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-600"
              }
            `}
          >
            <option value="">Todos los sprints</option>
            {uniqueSprints.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Filtro Tipo */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`
              px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-blue-400/40
              ${filterType
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-white border-gray-200 text-gray-600"
              }
            `}
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Gráfica */}
      <div className="px-6 py-6">
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-sm">No hay datos para los filtros seleccionados</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 35, right: 30, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="weekShort"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={{ stroke: "#e5e7eb" }}
                dy={8}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "#3b82f6" }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
                allowDecimals={false}
              />
              {chartData.some(d => d.puntajes > 0) && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#f97316" }}
                  axisLine={{ stroke: "#e5e7eb" }}
                  tickLine={false}
                  allowDecimals={false}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cantidad"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={<CustomDot />}
                activeDot={<CustomActiveDot />}
                name="Tickets"
              />
              {chartData.some(d => d.puntajes > 0) && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="puntajes"
                  stroke="#f97316"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={<CustomDot />}
                  activeDot={<CustomActiveDot />}
                  name="Puntajes"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Popup de detalle de semana (portaleado a body) ── */}
      {popup && portalRoot && createPortal(
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" style={{ zIndex: 99998 }} onClick={() => setPopup(null)} />
          <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 99999, padding: "1.5rem" }} onClick={() => setPopup(null)}>
            <div
              className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl flex flex-col animate-fade-in"
              style={{ maxHeight: "calc(100vh - 3rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Popup header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h4 className="text-lg font-bold font-[family-name:var(--font-heading)] text-gray-900">
                    Semana: {popup.weekLabel}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {popup.tickets.length} ticket{popup.tickets.length !== 1 ? "s" : ""} creado{popup.tickets.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setPopup(null)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Popup body */}
              <div className="overflow-y-auto flex-1 min-h-0 px-6 py-3">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-gray-400 font-semibold border-b border-gray-100 sticky top-0 bg-white">
                    <tr>
                      <th className="text-left py-2 pr-3">Tipo</th>
                      <th className="text-left py-2 pr-3">Clave</th>
                      <th className="text-left py-2 pr-3">Resumen</th>
                      <th className="text-center py-2 pr-3">Puntaje</th>
                      <th className="text-left py-2 pr-3">Estado</th>
                      <th className="text-left py-2">Creada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popup.tickets.map((t) => {
                      const tb = typeBadge(t.issue_type);
                      const created = t.created_at ? new Date(t.created_at) : null;
                      return (
                        <tr key={t.jira_key || t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="py-2.5 pr-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tb.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tb.dot}`} />
                              {t.issue_type}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <a
                              href={`${JIRA_BASE_URL}/${t.jira_key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              {t.jira_key}
                            </a>
                          </td>
                          <td className="py-2.5 pr-3 text-gray-700 max-w-[300px] truncate">{t.summary}</td>
                          <td className="py-2.5 pr-3 text-center">
                            {parseFloat(t.story_points) > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                                {t.story_points}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="text-xs text-gray-500">{t.status}</span>
                          </td>
                          <td className="py-2.5 text-xs text-gray-400 whitespace-nowrap">
                            {created
                              ? `${String(created.getDate()).padStart(2, "0")}/${String(created.getMonth() + 1).padStart(2, "0")}/${created.getFullYear()}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>,
        portalRoot
      )}
    </div>
  );
}
