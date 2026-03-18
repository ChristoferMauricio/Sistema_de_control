"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";
import { getCurrentSprint } from "@/lib/cronogramaData";

// Mapeo de estados internos de Jira → nombres de columna para el reporte
const STATUS_COLUMNS = [
    { key: "tareas_por_hacer", label: "1. Tareas por hacer", jiraStatuses: ["Tareas por hacer", "POR HACER"] },
    { key: "en_curso", label: "2. En curso", jiraStatuses: ["En curso"] },
    { key: "listo_para_dev", label: "3. Listo para dev", jiraStatuses: ["LISTO PARA DEV"] },
    { key: "control_calidad", label: "4. Control de calidad", jiraStatuses: ["Control de calidad", "QA EN DEV"] },
    { key: "finalizada", label: "5. Finalizada", jiraStatuses: ["Finalizada", "LISTO (PASE A CERT)"] },
];

const STATUS_COLORS = {
    tareas_por_hacer: "bg-gray-100 text-gray-700",
    en_curso: "bg-blue-100 text-blue-700",
    listo_para_dev: "bg-cyan-100 text-cyan-700",
    control_calidad: "bg-amber-100 text-amber-700",
    finalizada: "bg-green-100 text-green-700",
};

// Colores para la gráfica de trazabilidad
const CHART_STATUS_COLORS = {
    "Tareas por hacer": "#9ca3af",
    "POR HACER": "#9ca3af",
    "En curso": "#3b82f6",
    "LISTO PARA DEV": "#06b6d4",
    "Control de calidad": "#f59e0b",
    "QA EN DEV": "#f59e0b",
    "Finalizada": "#22c55e",
    "LISTO (PASE A CERT)": "#22c55e",
};

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

// ─── Traceability Gantt Modal ────────────────────────────────
function TraceModal({ assigneeName, stories, onClose }) {
    const [historyData, setHistoryData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch status history
    const fetchHistory = useCallback(async () => {
        const keys = stories.map((s) => s.jira_key);
        if (keys.length === 0) { setHistoryData({}); setLoading(false); return; }

        let allHistory = [];
        const batchSize = 50;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const { data } = await supabase
                .from("jira_ticket_status_history")
                .select("*")
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

    // Build Gantt data: for each story, create segments [{ status, start, end }]
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

// ─── Main Table ─────────────────────────────────────────────
export default function ReportesTable({ tickets = [], nombres = [] }) {
    const [selectedSprint, setSelectedSprint] = useState(() => getCurrentSprint(new Date())?.iteracion || "");
    const [traceModal, setTraceModal] = useState(null); // { assigneeName, stories }
    const [subtasksModal, setSubtasksModal] = useState(null); // { assigneeName, subtasks }

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
        return [...s].sort((a, b) => {
            const numA = a.match(/(\d+)/);
            const numB = b.match(/(\d+)/);
            if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
            return a.localeCompare(b);
        });
    }, [historias]);

    // Filtrar por sprint
    const filtered = useMemo(() => {
        if (!selectedSprint) return historias;
        return historias.filter((t) => t.sprint === selectedSprint);
    }, [historias, selectedSprint]);

    // Filtrar subtareas que corresponden al sprint Y que pertenecen a historias de PF3-1799
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
            if (!selectedSprint) return true;
            return t.sprint === selectedSprint || storyKeysBySprint.has(t.parent_key);
        });
    }, [tickets, selectedSprint, filtered]);

    // Crear mapa de Programador → Nombre (case-insensitive)
    const nameMap = useMemo(() => {
        const map = {};
        nombres.forEach((n) => {
            if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre;
        });
        return map;
    }, [nombres]);

    function resolveName(assigneeName) {
        if (!assigneeName || assigneeName.trim() === "") return "Sin asignar";
        return nameMap[assigneeName.toLowerCase()] || assigneeName;
    }

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

    // Pivotear: agrupar por nombre real, contar por estado
    const pivotData = useMemo(() => {
        const map = {};

        filtered.forEach((t) => {
            const realName = resolveName(t.assignee_name);
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
            const realName = resolveName(t.assignee_name);
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0, subtareasCount: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }
            map[realName].subtareasCount += 1;
        });

        return Object.values(map).map(row => ({
            ...row,
            puntajeTotal: row.total + row.subtareasCount
        })).sort((a, b) => b.puntajeTotal - a.puntajeTotal);
    }, [filtered, filteredSubtasks, nameMap]);

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

    // ─── Story Points pivot ─────────────────────────────
    const pivotDataSP = useMemo(() => {
        const map = {};

        filtered.forEach((t) => {
            const realName = resolveName(t.assignee_name);
            const sp = parseFloat(t.story_points) || 0;
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0, subtareasCount: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }

            map[realName].total += sp;

            const matched = STATUS_COLUMNS.find((col) =>
                col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
            );
            if (matched) {
                map[realName][matched.key] += sp;
            }
        });

        // Contar subtareas para la tabla de SP (cada subtarea = 1)
        filteredSubtasks.forEach((t) => {
            const realName = resolveName(t.assignee_name);
            if (!map[realName]) {
                map[realName] = { assignee: realName, total: 0, subtareasCount: 0 };
                STATUS_COLUMNS.forEach((col) => { map[realName][col.key] = 0; });
            }
            map[realName].subtareasCount += 1;
        });

        return Object.values(map).map(row => ({
            ...row,
            puntajeTotal: row.total + row.subtareasCount
        })).sort((a, b) => b.puntajeTotal - a.puntajeTotal);
    }, [filtered, filteredSubtasks, nameMap]);

    const totalsSP = useMemo(() => {
        const t = { total: 0, subtareasCount: 0, puntajeTotal: 0 };
        STATUS_COLUMNS.forEach((col) => { t[col.key] = 0; });
        pivotDataSP.forEach((row) => {
            t.total += row.total;
            t.subtareasCount += row.subtareasCount;
            t.puntajeTotal += row.puntajeTotal;
            STATUS_COLUMNS.forEach((col) => { t[col.key] += row[col.key]; });
        });
        return t;
    }, [pivotDataSP]);

    // Open traceability modal for a given assignee
    function openTrace(assigneeName) {
        // Find all stories for this assignee
        const storiesForAssignee = filtered.filter((t) => {
            const resolved = resolveName(t.assignee_name);
            return resolved === assigneeName;
        });
        setTraceModal({ assigneeName, stories: storiesForAssignee });
    }

    // Open subtasks modal for a given assignee
    function openSubtasks(assigneeName) {
        const assigneeSubtasks = filteredSubtasks.filter((t) => {
            const resolved = resolveName(t.assignee_name);
            return resolved === assigneeName;
        });
        setSubtasksModal({ assigneeName, subtasks: assigneeSubtasks });
    }

    const exportToExcel = () => {
        const now = new Date();
        const dateStr = now.toLocaleDateString("es-PE").replace(/\//g, "-");

        // --- Hoja 1: Historias por integrante ---
        const headers1 = ["Integrante", ...STATUS_COLUMNS.map(c => c.label), "Historias", "Soporte e Incidencias", "TOTAL"];
        const rows1 = pivotData.map(row => {
            const data = { Integrante: row.assignee };
            STATUS_COLUMNS.forEach(col => { data[col.label] = row[col.key]; });
            data["Historias"] = row.total;
            data["Soporte e Incidencias"] = row.subtareasCount;
            data["TOTAL"] = row.puntajeTotal;
            return data;
        });

        // Totales row 1
        const tRow1 = { Integrante: "TOTAL" };
        STATUS_COLUMNS.forEach(col => { tRow1[col.label] = totals[col.key]; });
        tRow1["Historias"] = totals.total;
        tRow1["Soporte e Incidencias"] = totals.subtareasCount;
        tRow1["TOTAL"] = totals.puntajeTotal;
        rows1.push(tRow1);

        const ws1 = XLSX.utils.json_to_sheet(rows1, { header: headers1 });

        // --- Hoja 2: Story Points por integrante ---
        const headersSP = ["Integrante", ...STATUS_COLUMNS.map(c => c.label), "Total SP", "Soporte e Incidencias", "TOTAL"];
        const rowsSP = pivotDataSP.map(row => {
            const data = { Integrante: row.assignee };
            STATUS_COLUMNS.forEach(col => { data[col.label] = row[col.key]; });
            data["Total SP"] = row.total;
            data["Soporte e Incidencias"] = row.subtareasCount;
            data["TOTAL"] = row.puntajeTotal;
            return data;
        });

        const tRowSP = { Integrante: "TOTAL" };
        STATUS_COLUMNS.forEach(col => { tRowSP[col.label] = totalsSP[col.key]; });
        tRowSP["Total SP"] = totalsSP.total;
        tRowSP["Soporte e Incidencias"] = totalsSP.subtareasCount;
        tRowSP["TOTAL"] = totalsSP.puntajeTotal;
        rowsSP.push(tRowSP);

        const wsSP = XLSX.utils.json_to_sheet(rowsSP, { header: headersSP });

        // --- Hoja 3: Historias filtradas (detalle) ---
        const headersRaw = ["Tipo", "Clave", "Resumen", "Subtareas", "Principal", "Épica", "Sprint", "Persona asignada", "Story Points", "Estado", "Informador", "Creada"];
        const rowsRaw = filtered.map(t => ({
            "Tipo": t.issue_type || "",
            "Clave": t.jira_key || "",
            "Resumen": t.summary || "",
            "Subtareas": t.subtask_keys?.join(", ") || "",
            "Principal": t.parent_key || "",
            "Épica": resolveEpic(t)?.summary || "",
            "Sprint": t.sprint || "",
            "Persona asignada": resolveName(t.assignee_name),
            "Story Points": t.story_points ?? "",
            "Estado": t.status || "",
            "Informador": resolveName(t.reporter_name),
            "Creada": t.created_at ? formatDate(t.created_at) : "",
        }));
        const wsRaw = XLSX.utils.json_to_sheet(rowsRaw, { header: headersRaw });

        // --- Aplicar Estilos a las Hojas ---
        const applyTableStyles = (ws, isRaw = false) => {
            if (!ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);
            
            // Configurar anchos de columna
            if (!isRaw) {
                ws['!cols'] = [
                    { wch: 18 }, // Integrante
                    ...STATUS_COLUMNS.map(() => ({ wch: 16 })), // Statuses
                    { wch: 12 }, // Historias / Total SP
                    { wch: 20 }, // Soporte e Incidencias
                    { wch: 12 }  // TOTAL
                ];
            } else {
                ws['!cols'] = [
                    { wch: 10 }, // Tipo
                    { wch: 14 }, // Clave
                    { wch: 45 }, // Resumen
                    { wch: 20 }, // Subtareas
                    { wch: 12 }, // Principal
                    { wch: 30 }, // Épica
                    { wch: 14 }, // Sprint
                    { wch: 18 }, // Persona asignada
                    { wch: 12 }, // Story Points
                    { wch: 16 }, // Estado
                    { wch: 18 }, // Informador
                    { wch: 16 }  // Creada
                ];
            }

            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
                    if (!ws[cellRef]) continue;

                    const isHeader = (R === 0);
                    const isLastRow = (!isRaw && R === range.e.r);
                    const isLastCol = (!isRaw && C === range.e.c);

                    let font = { name: "Arial", sz: 10 };
                    let fill = null;
                    let alignment = { vertical: "center", horizontal: "center" };
                    
                    // Alinear primer columna a la izquierda
                    if (C === 0) alignment.horizontal = "left"; 
                    if (isRaw && C === 1) alignment.horizontal = "left"; // Resumen left align
                    
                    if (isHeader) {
                        font.bold = true;
                        font.color = { rgb: "FFFFFFFF" };
                        fill = { fgColor: { rgb: "FF4B5563" } }; // Gray-600
                        alignment.horizontal = "center";
                    } else if (isLastRow) {
                        font.bold = true;
                        fill = { fgColor: { rgb: "FFF3F4F6" } }; // Gray-100
                    } else if (isLastCol) {
                        font.bold = true;
                        fill = { fgColor: { rgb: "FFFFF7ED" } }; // Orange-50
                    }

                    ws[cellRef].s = {
                        font,
                        alignment,
                        fill,
                        border: {
                            top: { style: "thin", color: { rgb: "FFD1D5DB" } },
                            bottom: { style: "thin", color: { rgb: "FFD1D5DB" } },
                            left: { style: "thin", color: { rgb: "FFD1D5DB" } },
                            right: { style: "thin", color: { rgb: "FFD1D5DB" } }
                        }
                    };
                }
            }
        };

        applyTableStyles(ws1, false);
        applyTableStyles(wsSP, false);
        applyTableStyles(wsRaw, true);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, "Historias");
        XLSX.utils.book_append_sheet(wb, wsSP, "Story Points");
        XLSX.utils.book_append_sheet(wb, wsRaw, "Detalle (Raw)");

        // ── Hoja "Tabla Dinámica" — layout igual al archivo de referencia ─────────
        const BDR = { style: "thin", color: { rgb: "FFD1D5DB" } };
        const BORDERS = { top: BDR, bottom: BDR, left: BDR, right: BDR };

        // Colores por estado (bg AARRGGBB, fg AARRGGBB)
        const STATUS_XL_COLORS = [
            { bg: "FFF3F4F6", fg: "FF374151" },  // Tareas por hacer: gray
            { bg: "FFDBEAFE", fg: "FF1D4ED8" },  // En curso: blue
            { bg: "FFCFFAFE", fg: "FF0E7490" },  // Listo para dev: cyan
            { bg: "FFFEF3C7", fg: "FFB45309" },  // Control de calidad: amber
            { bg: "FFD1FAE5", fg: "FF065F46" },  // Finalizada: green
        ];

        const statusJiraLabels = STATUS_COLUMNS.map(c => c.jiraStatuses[0]);
        const nPersonas = pivotData.length;
        const totalRowNum  = 6 + nPersonas;  // fila Excel (1-indexed) con "Total general"
        const percentRowNum = 8 + nPersonas; // fila Excel con "Total en %"
        const sprintLabel = selectedSprint || "Todos los sprints";

        // Columnas: A-G = tabla izq (7 cols), H = separador, I-O = tabla der (7 cols)
        // A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 I=8 J=9 K=10 L=11 M=12 N=13 O=14
        const aoa = [
            // Fila 1: filtro Tipo
            ["Tipo", "Historia", "", "", "", "", "", "", "Tipo", "Historia", "", "", "", "", ""],
            // Fila 2: filtro Sprint
            ["Sprint", sprintLabel, "", "", "", "", "", "", "Sprint", sprintLabel, "", "", "", "", ""],
            // Fila 3: vacía
            Array(15).fill(""),
            // Fila 4: títulos de tabla
            ["Cuenta de Clave", "Etiquetas de columna", "", "", "", "", "", "", "Suma de Story Points", "Etiquetas de columna", "", "", "", "", ""],
            // Fila 5: cabeceras de columna
            ["Etiquetas de fila", ...statusJiraLabels, "Total general", "", "Etiquetas de fila", ...statusJiraLabels, "Total general"],
        ];

        // Filas de datos
        for (const row of pivotData) {
            const spRow = pivotDataSP.find(r => r.assignee === row.assignee) || {};
            aoa.push([
                row.assignee,
                ...STATUS_COLUMNS.map(c => (row[c.key] > 0 ? row[c.key] : "")),
                row.total > 0 ? row.total : 0,
                "",
                row.assignee,
                ...STATUS_COLUMNS.map(c => (spRow[c.key] > 0 ? spRow[c.key] : "")),
                spRow.total > 0 ? spRow.total : 0,
            ]);
        }

        // Fila Total general
        aoa.push([
            "Total general",
            ...STATUS_COLUMNS.map(c => totals[c.key] || 0),
            totals.total || 0,
            "",
            "Total general",
            ...STATUS_COLUMNS.map(c => totalsSP[c.key] || 0),
            totalsSP.total || 0,
        ]);

        // Fila vacía
        aoa.push(Array(15).fill(""));

        // Fila "Total en %" (placeholder — las fórmulas se asignan abajo)
        aoa.push(["Total en %", "", "", "", "", "", "", "", "Total en %", "", "", "", "", "", ""]);

        const wsTD = XLSX.utils.aoa_to_sheet(aoa);

        // Anchos de columna
        wsTD["!cols"] = [
            { wch: 24 }, // A
            { wch: 17 }, // B: Tareas por hacer
            { wch: 12 }, // C: En curso
            { wch: 17 }, // D: LISTO PARA DEV
            { wch: 19 }, // E: Control de calidad
            { wch: 12 }, // F: Finalizada
            { wch: 14 }, // G: Total general
            { wch:  2 }, // H: separador
            { wch: 24 }, // I
            { wch: 17 }, // J
            { wch: 12 }, // K
            { wch: 17 }, // L
            { wch: 19 }, // M
            { wch: 12 }, // N
            { wch: 14 }, // O
        ];

        // Actualizar rango
        wsTD["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: percentRowNum - 1, c: 14 } });

        // ── Estilos ────────────────────────────────────────────────────────────
        const styleCell = (r, c, style) => {
            const addr = XLSX.utils.encode_cell({ c, r });
            if (!wsTD[addr]) wsTD[addr] = { t: "s", v: "" };
            wsTD[addr].s = { ...style, border: BORDERS };
        };

        // Fila 5 cabeceras (r=4)
        // A5 / I5: encabezado "Etiquetas de fila"
        for (const col of [0, 8]) {
            styleCell(4, col, {
                font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFFFF" } },
                fill: { fgColor: { rgb: "FF4B5563" } },
                alignment: { horizontal: "left", vertical: "center" },
            });
        }
        // B5-F5 / J5-N5: cabeceras de estado con color propio
        for (let si = 0; si < STATUS_COLUMNS.length; si++) {
            const { bg, fg } = STATUS_XL_COLORS[si];
            for (const base of [1, 9]) {
                styleCell(4, base + si, {
                    font: { name: "Arial", sz: 10, bold: true, color: { rgb: fg } },
                    fill: { fgColor: { rgb: bg } },
                    alignment: { horizontal: "center", vertical: "center" },
                });
            }
        }
        // G5 / O5: "Total general" cabecera
        for (const col of [6, 14]) {
            styleCell(4, col, {
                font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFFFF" } },
                fill: { fgColor: { rgb: "FFEA580C" } },
                alignment: { horizontal: "center", vertical: "center" },
            });
        }

        // Filas de datos (r = 5 a 4+nPersonas)
        for (let ri = 5; ri < 5 + nPersonas; ri++) {
            // A / I: nombre persona
            for (const col of [0, 8]) {
                styleCell(ri, col, {
                    font: { name: "Arial", sz: 10 },
                    alignment: { horizontal: "left", vertical: "center" },
                });
            }
            // B-F / J-N: datos de estado
            for (let si = 0; si < STATUS_COLUMNS.length; si++) {
                for (const base of [1, 9]) {
                    styleCell(ri, base + si, {
                        font: { name: "Arial", sz: 10 },
                        alignment: { horizontal: "center", vertical: "center" },
                    });
                }
            }
            // G / O: total persona
            for (const col of [6, 14]) {
                styleCell(ri, col, {
                    font: { name: "Arial", sz: 10, bold: true },
                    fill: { fgColor: { rgb: "FFFFF7ED" } },
                    alignment: { horizontal: "center", vertical: "center" },
                });
            }
        }

        // Fila "Total general" (r = totalRowNum - 1)
        const totIdx = totalRowNum - 1;
        for (let col = 0; col < 15; col++) {
            if (col === 7) continue;
            styleCell(totIdx, col, {
                font: { name: "Arial", sz: 10, bold: true },
                fill: { fgColor: { rgb: "FFF3F4F6" } },
                alignment: { horizontal: col === 0 || col === 8 ? "left" : "center", vertical: "center" },
            });
        }

        // Fila "Total en %" (r = percentRowNum - 1) — fórmulas + estilo amarillo
        const pctIdx = percentRowNum - 1;
        const pctStyle = {
            font: { name: "Arial", sz: 10, bold: true },
            fill: { fgColor: { rgb: "FFFFFF00" } },
            numFmt: "0.0%",
            alignment: { horizontal: "center", vertical: "center" },
            border: BORDERS,
        };
        const pctLabelStyle = {
            font: { name: "Arial", sz: 10, bold: true },
            fill: { fgColor: { rgb: "FFFFFF00" } },
            alignment: { horizontal: "left", vertical: "center" },
            border: BORDERS,
        };

        // Etiquetas "Total en %"
        wsTD[XLSX.utils.encode_cell({ c: 0, r: pctIdx })] = { t: "s", v: "Total en %", s: pctLabelStyle };
        wsTD[XLSX.utils.encode_cell({ c: 8, r: pctIdx })] = { t: "s", v: "Total en %", s: pctLabelStyle };

        // Fórmulas tabla izquierda: B-G / columnas 1-6
        for (let col = 1; col <= 6; col++) {
            const letter = String.fromCharCode(65 + col);
            wsTD[XLSX.utils.encode_cell({ c: col, r: pctIdx })] = {
                t: "n", v: 0,
                f: `${letter}${totalRowNum}/$G$${totalRowNum}`,
                s: pctStyle,
            };
        }
        // Fórmulas tabla derecha: J-O / columnas 9-14
        for (let col = 9; col <= 14; col++) {
            const letter = String.fromCharCode(65 + col);
            wsTD[XLSX.utils.encode_cell({ c: col, r: pctIdx })] = {
                t: "n", v: 0,
                f: `${letter}${totalRowNum}/$O$${totalRowNum}`,
                s: pctStyle,
            };
        }

        XLSX.utils.book_append_sheet(wb, wsTD, "Tabla Dinámica");

        XLSX.writeFile(wb, `Reporte_Jira_${selectedSprint ? selectedSprint.replace(/\s+/g, '_') : 'Todos'}_${dateStr}.xlsx`);
    };

    return (
        <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">
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
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50/80">
                                <th className="text-left px-4 py-2 font-semibold text-gray-700" style={{ minWidth: "160px" }}>
                                    Integrante
                                </th>
                                {STATUS_COLUMNS.map((col) => (
                                    <th key={col.key} className="text-center px-2 py-2 font-medium text-gray-500 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="text-center px-3 py-2 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                    Historias
                                </th>
                                <th className="text-center px-3 py-2 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "160px" }}>
                                    Soporte e Incidencias
                                </th>
                                <th className="text-center px-4 py-2 font-bold text-gray-900 border-l border-gray-200 bg-orange-50/50" style={{ minWidth: "100px" }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotData.length === 0 ? (
                                <tr>
                                    <td colSpan={STATUS_COLUMNS.length + 2} className="px-6 py-12 text-center text-gray-400">
                                        No hay historias {selectedSprint ? `en ${selectedSprint}` : ""}
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {pivotData.map((row) => (
                                        <tr key={row.assignee} className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">
                                                {row.assignee}
                                            </td>
                                            {STATUS_COLUMNS.map((col) => (
                                                <td key={col.key} className="px-2 py-2 text-center border-l border-gray-100">
                                                    {row[col.key] > 0 ? (
                                                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                            {row[col.key]}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-200 text-xs">0</span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-center border-l border-gray-100">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                                                        {row.total}
                                                    </span>
                                                    <button
                                                        onClick={() => openTrace(row.assignee)}
                                                        className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                                        title="Ver trazabilidad de historias"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-center border-l border-gray-100">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                        {row.subtareasCount}
                                                    </span>
                                                    <button
                                                        onClick={() => openSubtasks(row.assignee)}
                                                        className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                                        title="Ver detalles de soporte e incidencias"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center border-l border-gray-100 bg-gray-50/50">
                                                <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold text-gray-800">
                                                    {row.puntajeTotal}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totals row */}
                                    <tr className="border-t-2 border-gray-300 bg-gray-50/80 font-semibold">
                                        <td className="px-4 py-2 text-gray-700">TOTAL</td>
                                        {STATUS_COLUMNS.map((col) => (
                                            <td key={col.key} className="px-2 py-2 text-center border-l border-gray-100">
                                                <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                    {totals[col.key]}
                                                </span>
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center border-l border-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold bg-gray-200 text-gray-700">
                                                {totals.total}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center border-l border-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                                                {totals.subtareasCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center border-l border-gray-200 bg-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[36px] px-3 py-1 rounded-lg text-base font-bold text-gray-900">
                                                {totals.puntajeTotal}
                                            </span>
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Tabla 02: Story Points por integrante ─── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">
                        Story Points por integrante
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {totalsSP.total} SP totales · {pivotDataSP.length} integrante{pivotDataSP.length !== 1 ? "s" : ""}
                        {selectedSprint ? ` · ${selectedSprint}` : ""}
                    </p>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50/80">
                                <th className="text-left px-4 py-2 font-semibold text-gray-700" style={{ minWidth: "160px" }}>
                                    Integrante
                                </th>
                                {STATUS_COLUMNS.map((col) => (
                                    <th key={col.key} className="text-center px-2 py-2 font-medium text-gray-500 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="text-center px-3 py-2 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "100px" }}>
                                    Total SP
                                </th>
                                <th className="text-center px-3 py-2 font-semibold text-gray-700 border-l border-gray-200" style={{ minWidth: "160px" }}>
                                    Soporte e Incidencias
                                </th>
                                <th className="text-center px-4 py-2 font-bold text-gray-900 border-l border-gray-200 bg-gray-100" style={{ minWidth: "100px" }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotDataSP.length === 0 ? (
                                <tr>
                                    <td colSpan={STATUS_COLUMNS.length + 2} className="px-6 py-12 text-center text-gray-400">
                                        No hay historias {selectedSprint ? `en ${selectedSprint}` : ""}
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {pivotDataSP.map((row) => (
                                        <tr key={row.assignee} className="border-b border-gray-200 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap">
                                                {row.assignee}
                                            </td>
                                            {STATUS_COLUMNS.map((col) => (
                                                <td key={col.key} className="px-2 py-2 text-center border-l border-gray-100">
                                                    {row[col.key] > 0 ? (
                                                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                            {row[col.key]}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-200 text-xs">0</span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-center border-l border-gray-100">
                                                <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                                    {row.total}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-center border-l border-gray-100">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                        {row.subtareasCount}
                                                    </span>
                                                    <button
                                                        onClick={() => openSubtasks(row.assignee)}
                                                        className="p-1 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                                        title="Ver detalles de soporte e incidencias"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-center border-l border-gray-100 bg-gray-50/50">
                                                <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold text-gray-800">
                                                    {row.puntajeTotal}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totals row */}
                                    <tr className="border-t-2 border-gray-300 bg-gray-50/80 font-semibold">
                                        <td className="px-4 py-2 text-gray-700">TOTAL</td>
                                        {STATUS_COLUMNS.map((col) => (
                                            <td key={col.key} className="px-2 py-2 text-center border-l border-gray-100">
                                                <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                    {totalsSP[col.key]}
                                                </span>
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center border-l border-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold bg-gray-200 text-gray-700">
                                                {totalsSP.total}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center border-l border-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                                                {totalsSP.subtareasCount}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center border-l border-gray-200 bg-gray-100">
                                            <span className="inline-flex items-center justify-center min-w-[36px] px-3 py-1 rounded-lg text-base font-bold text-gray-900">
                                                {totalsSP.puntajeTotal}
                                            </span>
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

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
        </>
    );
}
