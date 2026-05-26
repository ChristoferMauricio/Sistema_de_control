/**
 * @file ReportesTable.js
 * @description Pagina de reportes con tablas pivot que agrupan historias Jira por integrante del equipo.
 *   Muestra dos tablas: una por cantidad de historias y otra por Story Points.
 *   Cada tabla desglosa las historias por estado (Tareas por hacer, En curso, Listo para dev,
 *   Control de calidad, Finalizada) e incluye conteo de subtareas de soporte e incidencias.
 *
 *   Componentes internos:
 *   - TraceModal: Diagrama Gantt de trazabilidad con historial de transiciones de estado por historia
 *   - SubtasksModal: Lista de subtareas de soporte e incidencias asignadas a un integrante
 *
 *   Funcionalidades:
 *   - Selector de sprint con sincronizacion a URL params
 *   - Exportacion a Excel con template (inyeccion de datos en hoja "Osi" con pivot cache)
 *   - Resolucion de nombres mediante cadena de tablas (equipo_desarrollo, jira_persons, Nombres)
 *   - Pivot de datos: agrupar tickets por nombre real y contar por estado
 */
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Download } from "lucide-react";
import { getCurrentSprint } from "@/lib/cronogramaData";
import { sortSprints, STATUS_COLUMNS, STATUS_COLORS, CHART_STATUS_COLORS } from "@/lib/utils";
import { exportUnifiedExcel } from "@/lib/exportExcel";

function getStatusColor(status) {
    return CHART_STATUS_COLORS[status] || "#d1d5db";
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

// ─── Modal de trazabilidad (Gantt) ──────────────────────────────────────────

/**
 * Modal que muestra un diagrama Gantt con las transiciones de estado de cada historia.
 * Consulta el historial de estados de Supabase y genera segmentos visuales por periodo.
 * @param {Object}   props
 * @param {string}   props.assigneeName - Nombre del integrante
 * @param {Array}    props.stories      - Historias asignadas al integrante
 * @param {Function} props.onClose      - Callback para cerrar el modal
 */
function TraceModal({ assigneeName, stories, onClose }) {
    const [historyData, setHistoryData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Carga el historial de estados de todas las historias en lotes de 50
    // para evitar exceder los limites de query de Supabase
    const fetchHistory = useCallback(async () => {
        const keys = stories.map((s) => s.jira_key);
        if (keys.length === 0) { setHistoryData({}); setLoading(false); return; }

        let allHistory = [];
        const batchSize = 50;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const { data } = await supabase
                .from("jira_ticket_status_history")
                .select("jira_key, old_status, new_status, changed_at")
                .in("jira_key", batch)
                .order("changed_at", { ascending: true });
            if (data) allHistory = [...allHistory, ...data];
        }

        const grouped = {};
        allHistory.forEach((h) => {
            if (!grouped[h.jira_key]) grouped[h.jira_key] = [];
            grouped[h.jira_key].push(h);
        });

        setHistoryData(grouped);
        setLoading(false);
    }, [stories]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    // Construye los datos del Gantt: para cada historia, crea segmentos [{ status, start, end }]
    // donde cada segmento representa un periodo en un estado determinado
    const ganttData = useMemo(() => {
        if (!historyData) return [];

        const now = new Date();
        return stories.map((story) => {
            const changes = historyData[story.jira_key] || [];
            const segments = [];

            changes.forEach((c, idx) => {
                const start = new Date(c.changed_at);
                const end = idx < changes.length - 1
                    ? new Date(changes[idx + 1].changed_at)
                    : now;
                segments.push({
                    status: c.new_status,
                    start,
                    end,
                    oldStatus: c.old_status,
                });
            });

            return {
                key: story.jira_key,
                summary: story.summary,
                currentStatus: story.status,
                segments,
            };
        });
    }, [stories, historyData]);

    // Global min/max dates for the X axis
    const { minDate, maxDate } = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        ganttData.forEach((row) => {
            row.segments.forEach((seg) => {
                if (seg.start.getTime() < min) min = seg.start.getTime();
                if (seg.end.getTime() > max) max = seg.end.getTime();
            });
        });
        if (min === Infinity) { min = Date.now() - 86400000; max = Date.now(); }
        // Add small padding
        const range = max - min;
        return { minDate: min - range * 0.02, maxDate: max + range * 0.02 };
    }, [ganttData]);

    const totalRange = maxDate - minDate;

    // Generate date ticks for X axis
    const dateTicks = useMemo(() => {
        if (totalRange <= 0) return [];
        const ticks = [];
        const tickCount = Math.min(10, Math.max(4, Math.floor(totalRange / (86400000))));
        const step = totalRange / tickCount;
        for (let i = 0; i <= tickCount; i++) {
            const ts = minDate + step * i;
            ticks.push({
                ts,
                pct: ((ts - minDate) / totalRange) * 100,
                label: new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
            });
        }
        return ticks;
    }, [minDate, maxDate, totalRange]);

    // Legend items (unique statuses)
    const legendItems = useMemo(() => {
        const seen = new Set();
        const items = [];
        ganttData.forEach((row) => {
            row.segments.forEach((seg) => {
                if (!seen.has(seg.status)) {
                    seen.add(seg.status);
                    items.push({ status: seg.status, color: getStatusColor(seg.status) });
                }
            });
        });
        return items;
    }, [ganttData]);

    const ROW_HEIGHT = 56;
    const LABEL_WIDTH = 280;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 py-8">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <div
                    className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="font-semibold text-gray-900 text-lg">
                                Transiciones de Estado por Historia
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {assigneeName} · {stories.length} historia{stories.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 overflow-y-auto overflow-x-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                <span className="ml-3 text-sm text-gray-500">Cargando trazabilidad...</span>
                            </div>
                        ) : (
                            <>
                                {/* Legend */}
                                <div className="flex flex-wrap items-center gap-4 mb-5">
                                    {legendItems.map((item) => (
                                        <div key={item.status} className="flex items-center gap-1.5">
                                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                                            <span className="text-xs text-gray-600">{item.status}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Gantt Chart */}
                                <div className="relative" style={{ minWidth: "700px" }}>
                                    {/* X axis grid lines + labels (top) */}
                                    <div className="flex" style={{ marginLeft: `${LABEL_WIDTH}px` }}>
                                        <div className="relative w-full h-6">
                                            {dateTicks.map((tick, i) => (
                                                <div
                                                    key={i}
                                                    className="absolute text-[10px] text-gray-400 -translate-x-1/2"
                                                    style={{ left: `${tick.pct}%` }}
                                                >
                                                    {tick.label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Rows */}
                                    {ganttData.map((row, rowIdx) => (
                                        <div
                                            key={row.key}
                                            className="flex items-center border-b border-gray-50"
                                            style={{ height: `${ROW_HEIGHT}px` }}
                                        >
                                            {/* Label */}
                                            <div
                                                className="shrink-0 pr-3 flex flex-col justify-center text-right"
                                                style={{ width: `${LABEL_WIDTH}px` }}
                                            >
                                                <a
                                                    href={`https://supervisorservicio2020.atlassian.net/browse/${row.key}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                                >
                                                    {row.key}
                                                </a>
                                                <span className="text-[11px] text-gray-400 truncate leading-tight mt-0.5" title={row.summary}>
                                                    {row.summary}
                                                </span>
                                            </div>

                                            {/* Chart area */}
                                            <div className="relative flex-1 h-full">
                                                {/* Grid lines */}
                                                {dateTicks.map((tick, i) => (
                                                    <div
                                                        key={i}
                                                        className="absolute top-0 bottom-0 border-l border-gray-100"
                                                        style={{ left: `${tick.pct}%` }}
                                                    />
                                                ))}

                                                {/* Status bars */}
                                                {row.segments.map((seg, segIdx) => {
                                                    const leftPct = ((seg.start.getTime() - minDate) / totalRange) * 100;
                                                    const widthPct = ((seg.end.getTime() - seg.start.getTime()) / totalRange) * 100;
                                                    const color = getStatusColor(seg.status);

                                                    return (
                                                        <div
                                                            key={segIdx}
                                                            className="absolute top-1 group cursor-default"
                                                            style={{
                                                                left: `${leftPct}%`,
                                                                width: `${Math.max(widthPct, 0.3)}%`,
                                                                height: `${ROW_HEIGHT - 8}px`,
                                                                backgroundColor: color,
                                                                borderRadius: "4px",
                                                                opacity: 0.85,
                                                            }}
                                                            title={`${seg.status}\n${formatDate(seg.start)} → ${formatDate(seg.end)}`}
                                                        >
                                                            {/* Tooltip on hover */}
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 pointer-events-none">
                                                                <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-xl">
                                                                    <div className="font-semibold">{seg.status}</div>
                                                                    <div className="text-gray-300 mt-0.5">
                                                                        {formatDate(seg.start)}
                                                                    </div>
                                                                    <div className="text-gray-300">
                                                                        → {formatDate(seg.end)}
                                                                    </div>
                                                                </div>
                                                                <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    {/* X axis labels (bottom) */}
                                    <div className="flex" style={{ marginLeft: `${LABEL_WIDTH}px` }}>
                                        <div className="relative w-full h-8 border-t border-gray-200">
                                            {dateTicks.map((tick, i) => (
                                                <div key={i}>
                                                    <div
                                                        className="absolute top-0 w-px h-2 bg-gray-300"
                                                        style={{ left: `${tick.pct}%` }}
                                                    />
                                                    <div
                                                        className="absolute top-3 text-[10px] text-gray-500 font-medium -translate-x-1/2"
                                                        style={{ left: `${tick.pct}%` }}
                                                    >
                                                        {tick.label}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Modal que muestra la lista de subtareas de soporte e incidencias asignadas a un integrante.
 * Las claves tienen color verde si estan completadas, rojo si no.
 * @param {Object}   props
 * @param {string}   props.assigneeName - Nombre del integrante
 * @param {Array}    props.subtasks     - Subtareas asignadas
 * @param {Function} props.onClose      - Callback para cerrar el modal
 */
function SubtasksModal({ assigneeName, subtasks, onClose }) {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 py-8">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <div
                    className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="font-semibold text-gray-900 text-lg">
                                Soporte e Incidencias Asignadas
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {assigneeName} · {subtasks.length} subtarea{subtasks.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto">
                        {subtasks.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">No hay subtareas registradas.</div>
                        ) : (
                            <ul className="space-y-3">
                                {subtasks.map((task) => {
                                    const statusLower = (task.status || "").toLowerCase();
                                    const isCompleted = statusLower.includes("finalizada") || statusLower.includes("terminada") || statusLower.includes("cerrado") || statusLower.includes("done");
                                    const statusColorClass = isCompleted ? "text-green-600 hover:text-green-800" : "text-red-600 hover:text-red-800";

                                    return (
                                        <li key={task.jira_key} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex gap-4 items-start">
                                            <a
                                                href={`https://supervisorservicio2020.atlassian.net/browse/${task.jira_key}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`font-mono font-bold shrink-0 hover:underline ${statusColorClass}`}
                                            >
                                                {task.jira_key}
                                            </a>
                                            <div className="text-sm text-gray-700 whitespace-normal break-words flex-1 leading-snug">
                                                {task.summary}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Modal de detalle de tickets (click en números de tabla pivot) ───────────

const JIRA_BASE = "https://supervisorservicio2020.atlassian.net/browse";

function TicketListModal({ title, assigneeName, items, onClose }) {
    const [changeDates, setChangeDates] = useState({});

    useEffect(() => {
        const keys = items.map(t => t.jira_key).filter(Boolean);
        if (keys.length === 0) return;

        // Consultar el historial de estados de estos tickets para obtener la última transición real
        supabase
            .from("jira_ticket_status_history")
            .select("jira_key, changed_at")
            .in("jira_key", keys)
            .order("changed_at", { ascending: true })
            .then(({ data, error }) => {
                if (error) {
                    console.error("Error cargando historial de estados en modal:", error);
                    return;
                }
                const datesMap = {};
                if (data) {
                    data.forEach((h) => {
                        // El orden es ascendente cronológicamente por changed_at, 
                        // por lo que el último registro para una clave sobreescribirá y representará el cambio más reciente.
                        datesMap[h.jira_key] = h.changed_at;
                    });
                }
                setChangeDates(datesMap);
            });
    }, [items]);

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 py-8">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <div
                    className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {assigneeName} · {items.length} ticket{items.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto space-y-3">
                        {items.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">No hay tickets registrados.</div>
                        ) : (
                            items.map((ticket) => {
                                const statusLower = (ticket.status || "").toLowerCase();
                                const isCompleted = statusLower.includes("finalizada") || statusLower.includes("terminada") || statusLower.includes("done") || statusLower.includes("listo");
                                const isSubtask = ticket.issue_type === "Sub-tarea" || ticket.issue_type === "Subtarea";

                                // La fecha de cambio es el último cambio de estado obtenido del historial o en su defecto updated_at / created_at.
                                const rawChangeDate = changeDates[ticket.jira_key] || ticket.updated_at || ticket.created_at;

                                return (
                                    <div key={ticket.jira_key} className="p-4 bg-gray-50 rounded-xl border-2 border-gray-300">
                                        <div className="flex items-start gap-3">
                                            <a
                                                href={`${JIRA_BASE}/${ticket.jira_key}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`font-mono font-bold shrink-0 hover:underline ${isCompleted ? "text-green-600" : "text-orange-600"}`}
                                            >
                                                {ticket.jira_key}
                                            </a>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-gray-800 leading-snug">{ticket.summary}</div>
                                                
                                                {/* Contenedor flex para alinear etiquetas a la izquierda y fechas a la derecha */}
                                                <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5 w-full">
                                                    {/* Etiquetas de ticket (izquierda) */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${isSubtask
                                                            ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
                                                            : "bg-sky-50 text-sky-600 border border-sky-200"
                                                            }`}>
                                                            {ticket.issue_type}
                                                        </span>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${isCompleted
                                                            ? "bg-green-50 text-green-600 border border-green-200"
                                                            : "bg-amber-50 text-amber-600 border border-amber-200"
                                                            }`}>
                                                            {ticket.status}
                                                        </span>
                                                        {ticket.story_points != null && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-200">
                                                                {ticket.story_points} SP
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Cajas de fechas responsivas (derecha) */}
                                                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-medium leading-none">
                                                        {/* Cuadro naranja: Fecha de creación */}
                                                        {ticket.created_at && (
                                                            <div 
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-50 text-orange-700 border border-orange-200" 
                                                                title={`Fecha de creación: ${formatDate(ticket.created_at)}`}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                </svg>
                                                                <span>Creado: {formatDateShort(ticket.created_at)}</span>
                                                            </div>
                                                        )}

                                                        {/* Cuadro rojo: Fecha de cambio */}
                                                        {rawChangeDate && (
                                                            <div 
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-50 text-red-700 border border-red-200" 
                                                                title={`Último cambio de estado: ${formatDate(rawChangeDate)}`}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                </svg>
                                                                <span>Cambiado: {formatDateShort(rawChangeDate)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Tabla principal de reportes con tablas pivot por integrante (historias y story points).
 * @param {Object} props
 * @param {Array}  props.tickets  - Todos los tickets Jira del proyecto
 * @param {Array}  props.nombres  - Datos de la tabla "Nombres" para mapeo Programador -> Nombre
 */
export default function ReportesTable({ tickets = [], nombres = [] }) {
    const [selectedSprint, setSelectedSprint] = useState(() => getCurrentSprint(new Date())?.iteracion || "");
    const [labelFilter, setLabelFilter] = useState("reportar"); // "todo" | "reportar" | "no_reportar"
    const [hideCarolina, setHideCarolina] = useState(true);
    const [persons, setPersons] = useState([]);
    const [equipo, setEquipo] = useState([]);

    // Cargar jira_persons + equipo_desarrollo para resolver nombres
    useEffect(() => {
        Promise.all([
            supabase.from("jira_persons").select("email, display_name"),
            supabase.from("equipo_desarrollo").select("nombre, nombre_clave, correo_pgim, correo_gcorp"),
        ]).then(([personsRes, equipoRes]) => {
            if (personsRes.data) setPersons(personsRes.data);
            if (equipoRes.data) setEquipo(equipoRes.data);
        });
    }, []);
    const [traceModal, setTraceModal] = useState(null); // { assigneeName, stories }
    const [subtasksModal, setSubtasksModal] = useState(null); // { assigneeName, subtasks }
    const [detailModal, setDetailModal] = useState(null); // { title, assigneeName, items }

    // Sincronizar selectedSprint con parámetro URL ?sprint=
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

    // Helpers para tipos de issue
    const isStory = (type) => (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";
    const isSubtask = (type) => (type || "").toLowerCase().includes("subtare") || (type || "").toLowerCase().includes("sub-task") || (type || "").toLowerCase() === "subtask";
    const isEpic = (type) => (type || "").toLowerCase().includes("epic") || (type || "").toLowerCase().includes("épica");

    // Mapa completo de tickets O(1)
    const ticketMap = useMemo(() => {
        const map = {};
        tickets.forEach((t) => { map[t.jira_key] = t; });
        return map;
    }, [tickets]);

    // Resolver resumen de la Épica igual que en Vista General
    const resolveEpic = useCallback((ticket) => {
        if (!ticket) return null;
        if (isEpic(ticket.issue_type)) return { key: ticket.jira_key, summary: ticket.summary };

        if (isStory(ticket.issue_type) && ticket.parent_key) {
            const parent = ticketMap[ticket.parent_key];
            if (parent && isEpic(parent.issue_type)) return { key: parent.jira_key, summary: parent.summary };
        }

        if (isSubtask(ticket.issue_type) && ticket.parent_key) {
            const parentStory = ticketMap[ticket.parent_key];
            if (parentStory && isStory(parentStory.issue_type) && parentStory.parent_key) {
                const grandParentEpic = ticketMap[parentStory.parent_key];
                if (grandParentEpic && isEpic(grandParentEpic.issue_type)) return { key: grandParentEpic.jira_key, summary: grandParentEpic.summary };
            }
        }
        return null;
    }, [ticketMap]);

    // Solo Historias
    const historias = useMemo(() => {
        return tickets.filter((t) => t.issue_type === "Historia");
    }, [tickets]);

    // Sprints disponibles (de las historias)
    const sprints = useMemo(() => {
        const s = new Set();
        historias.forEach((t) => { if (t.sprint) s.add(t.sprint); });
        return sortSprints([...s]);
    }, [historias]);

    // Detectar si el sprint seleccionado pertenece al tablero PF3QA
    // (los sprints del tablero QA tienen formato "Tablero Sprint N")
    // para ocultar la columna de soporte e incidencias
    const isPF3QA = /Tablero\s+Sprint/i.test(selectedSprint);

    // Filtrar por sprint + etiqueta
    const filtered = useMemo(() => {
        let result = historias;
        if (selectedSprint) result = result.filter((t) => t.sprint === selectedSprint);
        if (labelFilter === "reportar") result = result.filter((t) => !Array.isArray(t.labels) || !t.labels.includes("No_Reportar"));
        if (labelFilter === "no_reportar") result = result.filter((t) => Array.isArray(t.labels) && t.labels.includes("No_Reportar"));
        return result;
    }, [historias, selectedSprint, labelFilter]);

    // ── Subtareas de soporte e incidencias ────────────────────────────────────
    // Filtra subtareas que pertenecen a historias de la epica PF3-1799 (estabilizacion)
    // y que coinciden con el sprint seleccionado
    const filteredSubtasks = useMemo(() => {
        const subtareas = tickets.filter(t => t.issue_type === "Subtarea");

        // Match sprint directly or use parent story sprint
        const storyKeysBySprint = new Set(filtered.map(s => s.jira_key));

        // Get all stories that are part of the stabilizing epic PF3-1799.
        // We identify them by checking if the epic is PF3-1799 or if their summary has "(Iteraci[oó]n"
        const validParentKeys = new Set(
            tickets
                .filter(t => t.issue_type === "Historia" && (t.parent_key === "PF3-1799" || t.summary.match(/\(Iteraci[oó]n/i)))
                .map(t => t.jira_key)
        );

        return subtareas.filter(t => {
            // First, it MUST belong to one of the PF3-1799 iteration stories
            if (!validParentKeys.has(t.parent_key)) return false;

            // Second, it must pass the sprint filter if one is selected
            if (selectedSprint && !(t.sprint === selectedSprint || storyKeysBySprint.has(t.parent_key))) return false;

            // Third, apply label filter
            if (labelFilter === "reportar" && Array.isArray(t.labels) && t.labels.includes("No_Reportar")) return false;
            if (labelFilter === "no_reportar" && (!Array.isArray(t.labels) || !t.labels.includes("No_Reportar"))) return false;

            return true;
        });
    }, [tickets, selectedSprint, filtered, labelFilter]);

    // Crear mapa de Programador → Nombre (case-insensitive)
    // nameMap: jiraDisplayName.lower → alias personalizado (tabla Nombres)
    const nameMap = useMemo(() => {
        const map = {};
        nombres.forEach((n) => {
            if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre;
        });
        return map;
    }, [nombres]);

    // personsMap: accountId/email → jira displayName
    const personsMap = useMemo(() => {
        const map = {};
        persons.forEach((p) => { if (p.email) map[p.email] = p.display_name; });
        return map;
    }, [persons]);

    // equipoEmailMap: correo_pgim / correo_gcorp → nombre real
    const equipoEmailMap = useMemo(() => {
        const map = {};
        equipo.forEach((m) => {
            if (m.correo_pgim) map[m.correo_pgim.toLowerCase()] = m.nombre;
            if (m.correo_gcorp && m.correo_gcorp !== "-") map[m.correo_gcorp.toLowerCase()] = m.nombre;
        });
        return map;
    }, [equipo]);

    // equipoKeyMap: nombre_clave → nombre real
    const equipoKeyMap = useMemo(() => {
        const map = {};
        equipo.forEach((m) => {
            if (m.nombre_clave && m.nombre_clave !== "-") map[m.nombre_clave.toLowerCase()] = m.nombre;
        });
        return map;
    }, [equipo]);

    // Cadena: correo directo → jira display_name → equipo_desarrollo / Nombres → fallback
    const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

    const resolveName = useCallback((email) => {
        if (!email || email.trim() === "") return "Sin asignar";
        const byEmail = equipoEmailMap[email.toLowerCase()];
        if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
        const displayName = personsMap[email] || email;
        const resolved = equipoKeyMap[displayName.toLowerCase()]
            || nameMap[displayName.toLowerCase()]
            || displayName;
        return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
    }, [nameMap, personsMap, equipoEmailMap, equipoKeyMap]);

    // Crear mapa inverso: Nombre → lista de Programador keys
    const reverseNameMap = useMemo(() => {
        const map = {};
        nombres.forEach((n) => {
            if (n.Programador && n.Nombre) {
                if (!map[n.Nombre]) map[n.Nombre] = [];
                map[n.Nombre].push(n.Programador.toLowerCase());
            }
        });
        return map;
    }, [nombres]);

    // ── Pivot: agrupar historias por integrante y contar por estado ────────────
    // Crea una fila por cada integrante con el conteo de historias en cada estado
    // y el total de subtareas de soporte. El puntaje total = historias + subtareas.
    const pivotData = useMemo(() => {
        const map = {};

        filtered.forEach((t) => {
            const realName = resolveName(t.assignee_email);
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0, subtareasCount: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }

            map[realName].total += 1;

            const matched = STATUS_COLUMNS.find((col) =>
                col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
            );
            if (matched) {
                map[realName][matched.key] += 1;
            }
        });

        // Contar subtareas
        filteredSubtasks.forEach((t) => {
            const realName = resolveName(t.assignee_email);
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0, subtareasCount: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }
            map[realName].subtareasCount += 1;
        });

        return Object.values(map)
            .filter(row => !(hideCarolina && row.assignee.toLowerCase().includes("carolina")))
            .map(row => ({
                ...row,
                puntajeTotal: row.total + row.subtareasCount
            })).sort((a, b) => a.assignee.localeCompare(b.assignee, "es"));
    }, [filtered, filteredSubtasks, resolveName, hideCarolina]);

    // Totales por columna
    const totals = useMemo(() => {
        const t = { total: 0, subtareasCount: 0, puntajeTotal: 0 };
        STATUS_COLUMNS.forEach((col) => { t[col.key] = 0; });
        pivotData.forEach((row) => {
            t.total += row.total;
            t.subtareasCount += row.subtareasCount;
            t.puntajeTotal += row.puntajeTotal;
            STATUS_COLUMNS.forEach((col) => { t[col.key] += row[col.key]; });
        });
        return t;
    }, [pivotData]);

    // ── Pivot de Story Points: suma SP por integrante, distribuyendo por estado de subtareas ──
    const pivotDataSP = useMemo(() => {
        const map = {};

        filtered.forEach((t) => {
            const realName = resolveName(t.assignee_email);
            const sp = parseFloat(t.story_points) || 0;
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }

            // Buscar subtareas de esta historia
            const subs = filteredSubtasks.filter(s => s.parent_key === t.jira_key);

            if (subs.length > 0) {
                // Cada subtarea vale 1 punto, distribuido por su estado
                map[realName].total += subs.length;
                subs.forEach(sub => {
                    const matched = STATUS_COLUMNS.find(col =>
                        col.jiraStatuses.some(s => s.toLowerCase() === (sub.status || "").toLowerCase())
                    );
                    if (matched) map[realName][matched.key] += 1;
                });
            } else {
                // Sin subtareas: SP va al estado de la historia
                map[realName].total += sp;
                const matched = STATUS_COLUMNS.find((col) =>
                    col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
                );
                if (matched) map[realName][matched.key] += sp;
            }
        });

        return Object.values(map)
            .filter(row => !(hideCarolina && row.assignee.toLowerCase().includes("carolina")))
            .map(row => ({
                ...row,
                puntajeTotal: row.total
            })).sort((a, b) => a.assignee.localeCompare(b.assignee, "es"));
    }, [filtered, filteredSubtasks, resolveName, hideCarolina]);

    const totalsSP = useMemo(() => {
        const t = { total: 0, puntajeTotal: 0 };
        STATUS_COLUMNS.forEach((col) => { t[col.key] = 0; });
        pivotDataSP.forEach((row) => {
            t.total += row.total;
            t.puntajeTotal += row.puntajeTotal;
            STATUS_COLUMNS.forEach((col) => { t[col.key] += row[col.key]; });
        });
        return t;
    }, [pivotDataSP]);

    // Open traceability modal for a given assignee
    function openTrace(assigneeName) {
        // Find all stories for this assignee
        const storiesForAssignee = filtered.filter((t) => {
            const resolved = resolveName(t.assignee_email);
            return resolved === assigneeName;
        });
        setTraceModal({ assigneeName, stories: storiesForAssignee });
    }

    // Open subtasks modal for a given assignee
    function openSubtasks(assigneeName) {
        const assigneeSubtasks = filteredSubtasks.filter((t) => {
            const resolved = resolveName(t.assignee_email);
            return resolved === assigneeName;
        });
        setSubtasksModal({ assigneeName, subtasks: assigneeSubtasks });
    }

    // Open detail modal: show historias or subtareas filtered by assignee + status
    function openDetail(assigneeName, statusKey, source = "historias") {
        let items;
        let title;

        const filterByStatus = (list) => {
            if (!statusKey) return list;
            return list.filter((t) => {
                const matched = STATUS_COLUMNS.find((col) =>
                    col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
                );
                return matched?.key === statusKey;
            });
        };
        const statusLabel = statusKey ? STATUS_COLUMNS.find((c) => c.key === statusKey)?.label || statusKey : null;

        if (source === "subtareas") {
            const personSubtasks = filteredSubtasks.filter(
                (t) => resolveName(t.assignee_email) === assigneeName
            );
            items = filterByStatus(personSubtasks);
            title = statusLabel ? `Subtareas — ${statusLabel}` : "Todas las subtareas";
        } else if (source === "sp") {
            // SP table: historias sin subtareas muestran la historia,
            // historias con subtareas muestran las subtareas directamente (1 punto c/u)
            const personHistorias = filtered.filter(
                (t) => resolveName(t.assignee_email) === assigneeName
            );
            const result = [];
            personHistorias.forEach((t) => {
                const subs = filteredSubtasks.filter(s => s.parent_key === t.jira_key);
                if (subs.length > 0) {
                    // Mostrar subtareas individuales
                    subs.forEach((sub) => {
                        if (!statusKey) { result.push(sub); return; }
                        const matched = STATUS_COLUMNS.find((col) =>
                            col.jiraStatuses.some((s) => s.toLowerCase() === (sub.status || "").toLowerCase())
                        );
                        if (matched?.key === statusKey) result.push(sub);
                    });
                } else {
                    // Sin subtareas: mostrar historia
                    if (!statusKey) { result.push(t); return; }
                    const matched = STATUS_COLUMNS.find((col) =>
                        col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
                    );
                    if (matched?.key === statusKey) result.push(t);
                }
            });
            items = result;
            title = statusLabel ? `SP — ${statusLabel}` : "Todas las historias (SP)";
        } else {
            // Tabla de Historias → filtrar por estado de la historia
            const personHistorias = filtered.filter(
                (t) => resolveName(t.assignee_email) === assigneeName
            );
            items = filterByStatus(personHistorias);
            title = statusLabel ? `Historias — ${statusLabel}` : "Todas las historias";
        }

        setDetailModal({ title, assigneeName, items });
    }

    /**
     * Exporta a Excel unificado con tablas dinámicas (Osi + Datos QA).
     * Delega al módulo compartido exportExcel.js
     */
    const exportToExcel = () => exportUnifiedExcel(selectedSprint);

    return (
        <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h3 className="text-[15px] font-semibold font-[family-name:var(--font-heading)] text-gray-900">
                            Historias por integrante
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {filtered.length} historia{filtered.length !== 1 ? "s" : ""} · {pivotData.length} integrante{pivotData.length !== 1 ? "s" : ""}
                        </p>
                    </div>

                    {/* Actions & Filters */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={exportToExcel}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                            title="Descargar datos actuales en formato Excel"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Exportar Excel</span>
                        </button>

                        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                            <label className="text-xs font-medium text-gray-500">Sprint:</label>
                            <select
                                value={selectedSprint}
                                onChange={(e) => setSelectedSprint(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[180px]"
                            >
                                <option value="">Todos los sprints</option>
                                {sprints.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            {selectedSprint && (
                                <button
                                    onClick={() => setSelectedSprint("")}
                                    className="text-xs text-orange-500 hover:text-orange-600 font-medium whitespace-nowrap"
                                >
                                    Limpiar
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                            <label className="text-xs font-medium text-gray-500">Etiqueta:</label>
                            <select
                                value={labelFilter}
                                onChange={(e) => setLabelFilter(e.target.value)}
                                className={`px-2.5 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[120px] ${labelFilter !== "todo"
                                    ? "border-orange-300 bg-orange-50 text-orange-700 font-medium"
                                    : "border-gray-200 bg-white text-gray-700"
                                    }`}
                            >
                                <option value="todo">Todo</option>
                                <option value="reportar">Reportar</option>
                                <option value="no_reportar">No Reportar</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                            <label className="text-xs font-medium text-gray-500">Etiqueta:</label>
                            <select
                                value={hideCarolina ? "reportar" : "todo"}
                                onChange={(e) => setHideCarolina(e.target.value === "reportar")}
                                className={`px-2.5 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[120px] ${hideCarolina
                                    ? "border-orange-300 bg-orange-50 text-orange-700 font-medium"
                                    : "border-gray-200 bg-white text-gray-700"
                                    }`}
                            >
                                <option value="todo">Todo</option>
                                <option value="reportar">Reportar</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50/80">
                                <th className="text-left px-3 py-1.5 font-semibold text-gray-700" style={{ minWidth: "160px" }}>
                                    Integrante
                                </th>
                                {STATUS_COLUMNS.map((col) => (
                                    <th key={col.key} className="text-center px-1.5 py-1.5 font-medium text-gray-500 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="text-center px-2 py-1.5 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                    Historias
                                </th>
                                {!isPF3QA && (
                                    <th className="text-center px-2 py-1.5 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "160px" }}>
                                        Soporte e Incidencias
                                    </th>
                                )}
                                <th className="text-center px-3 py-1.5 font-bold text-gray-900 border-l border-gray-200 bg-orange-50/50" style={{ minWidth: "100px" }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotData.length === 0 ? (
                                <tr>
                                    <td colSpan={STATUS_COLUMNS.length + 2} className="px-4 py-8 text-center text-gray-400">
                                        No hay historias {selectedSprint ? `en ${selectedSprint}` : ""}
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {pivotData.map((row) => (
                                        <tr key={row.assignee} className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-3 py-1 font-medium text-gray-800 whitespace-nowrap">
                                                {row.assignee}
                                            </td>
                                            {STATUS_COLUMNS.map((col) => (
                                                <td key={col.key} className="px-1.5 py-1 text-center border-l border-gray-100">
                                                    {row[col.key] > 0 ? (
                                                        <button
                                                            onClick={() => openDetail(row.assignee, col.key)}
                                                            className={`inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded-lg text-xs font-bold cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all ${STATUS_COLORS[col.key]}`}
                                                            title={`Ver tickets — ${col.label}`}
                                                        >
                                                            {row[col.key]}
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-200 text-xs">0</span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-2 py-1 text-center border-l border-gray-100">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        onClick={() => openDetail(row.assignee, null)}
                                                        className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200 cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all"
                                                        title="Ver todos los tickets"
                                                    >
                                                        {row.total}
                                                    </button>
                                                    <button
                                                        onClick={() => openTrace(row.assignee)}
                                                        className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                                        title="Ver trazabilidad de historias"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            {!isPF3QA && (
                                                <td className="px-2 py-1 text-center border-l border-gray-100">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => openSubtasks(row.assignee)}
                                                            className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all"
                                                            title="Ver subtareas"
                                                        >
                                                            {row.subtareasCount}
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                            <td className="px-3 py-1 text-center border-l border-gray-100 bg-gray-50/50">
                                                <button
                                                    onClick={() => openDetail(row.assignee, null)}
                                                    className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-sm font-bold text-gray-800 cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all"
                                                    title="Ver todos los tickets"
                                                >
                                                    {isPF3QA ? row.total : row.puntajeTotal}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totals row */}
                                    <tr className="border-t-2 border-gray-300 bg-gray-50/80 font-semibold">
                                        <td className="px-3 py-1.5 text-gray-700">TOTAL</td>
                                        {STATUS_COLUMNS.map((col) => (
                                            <td key={col.key} className="px-1.5 py-1.5 text-center border-l border-gray-100">
                                                <div className="flex flex-col items-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                        {totals[col.key]}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                                        {totals.total > 0 ? Math.round(totals[col.key] / totals.total * 100) : 0}%
                                                    </span>
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-3 py-1.5 text-center border-l border-gray-100">
                                            <div className="flex flex-col items-center">
                                                <span className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-sm font-bold bg-gray-200 text-gray-700">
                                                    {totals.total}
                                                </span>
                                                <span className="text-[10px] text-gray-400 mt-0.5">100%</span>
                                            </div>
                                        </td>
                                        {!isPF3QA && (
                                            <td className="px-3 py-1.5 text-center border-l border-gray-100">
                                                <span className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                                                    {totals.subtareasCount}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-3 py-1.5 text-center border-l border-gray-200 bg-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-1 rounded-lg text-base font-bold text-gray-900">
                                                {isPF3QA ? totals.total : totals.puntajeTotal}
                                            </span>
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Tabla 02: Story Points por integrante (solo PF3) ─── */}
            {!isPF3QA && <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-[15px] font-semibold font-[family-name:var(--font-heading)] text-gray-900">
                        Story Points por integrante
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {totalsSP.total} SP totales · {pivotDataSP.length} integrante{pivotDataSP.length !== 1 ? "s" : ""}
                        {selectedSprint ? ` · ${selectedSprint}` : ""}
                    </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50/80">
                                <th className="text-left px-3 py-1.5 font-semibold text-gray-700" style={{ minWidth: "160px" }}>
                                    Integrante
                                </th>
                                {STATUS_COLUMNS.map((col) => (
                                    <th key={col.key} className="text-center px-1.5 py-1.5 font-medium text-gray-500 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="text-center px-3 py-1.5 font-bold text-gray-900 border-l border-gray-200 bg-gray-100" style={{ minWidth: "100px" }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotDataSP.length === 0 ? (
                                <tr>
                                    <td colSpan={STATUS_COLUMNS.length + 2} className="px-4 py-8 text-center text-gray-400">
                                        No hay historias {selectedSprint ? `en ${selectedSprint}` : ""}
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {pivotDataSP.map((row) => (
                                        <tr key={row.assignee} className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-3 py-1 font-medium text-gray-800 whitespace-nowrap">
                                                {row.assignee}
                                            </td>
                                            {STATUS_COLUMNS.map((col) => (
                                                <td key={col.key} className="px-1.5 py-1 text-center border-l border-gray-100">
                                                    {row[col.key] > 0 ? (
                                                        <button
                                                            onClick={() => openDetail(row.assignee, col.key, "sp")}
                                                            className={`inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded-lg text-xs font-bold cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all ${STATUS_COLORS[col.key]}`}
                                                            title={`Ver tickets — ${col.label}`}
                                                        >
                                                            {Math.round(row[col.key] * 100) / 100}
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-200 text-xs">0</span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1 text-center border-l border-gray-100 bg-gray-50/50">
                                                <button
                                                    onClick={() => openDetail(row.assignee, null, "sp")}
                                                    className="inline-flex items-center justify-center min-w-[32px] px-1 py-0.5 rounded-lg text-sm font-bold text-gray-800 cursor-pointer hover:ring-2 hover:ring-orange-300 transition-all"
                                                    title="Ver todos los tickets"
                                                >
                                                    {row.puntajeTotal}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totals row */}
                                    <tr className="border-t-2 border-gray-300 bg-gray-50/80 font-semibold">
                                        <td className="px-3 py-1.5 text-gray-700">TOTAL</td>
                                        {STATUS_COLUMNS.map((col) => (
                                            <td key={col.key} className="px-1.5 py-1.5 text-center border-l border-gray-100">
                                                <div className="flex flex-col items-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[28px] px-1 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                        {totalsSP[col.key]}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                                        {totalsSP.total > 0 ? Math.round(totalsSP[col.key] / totalsSP.total * 100) : 0}%
                                                    </span>
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-3 py-1.5 text-center border-l border-gray-200 bg-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-1 rounded-lg text-base font-bold text-gray-900">
                                                {totalsSP.puntajeTotal}
                                            </span>
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>}

            {/* Traceability Modal */}
            {traceModal && (
                <TraceModal
                    assigneeName={traceModal.assigneeName}
                    stories={traceModal.stories}
                    onClose={() => setTraceModal(null)}
                />
            )}

            {/* Subtasks Modal */}
            {subtasksModal && (
                <SubtasksModal
                    assigneeName={subtasksModal.assigneeName}
                    subtasks={subtasksModal.subtasks}
                    onClose={() => setSubtasksModal(null)}
                />
            )}

            {/* Ticket List Detail Modal */}
            {detailModal && (
                <TicketListModal
                    title={detailModal.title}
                    assigneeName={detailModal.assigneeName}
                    items={detailModal.items}
                    onClose={() => setDetailModal(null)}
                />
            )}
        </>
    );
}
