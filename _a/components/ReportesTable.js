"use client";

import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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

// ─── Traceability Modal ─────────────────────────────────────
function TraceModal({ assigneeName, stories, onClose }) {
    const [historyData, setHistoryData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch status history for all jira_keys of this assignee
    const fetchHistory = useCallback(async () => {
        const keys = stories.map((s) => s.jira_key);
        if (keys.length === 0) { setHistoryData({}); setLoading(false); return; }

        // Fetch all status history for these keys
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

        // Group by jira_key
        const grouped = {};
        allHistory.forEach((h) => {
            if (!grouped[h.jira_key]) grouped[h.jira_key] = [];
            grouped[h.jira_key].push(h);
        });

        setHistoryData(grouped);
        setLoading(false);
    }, [stories]);

    useState(() => { fetchHistory(); });

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 py-8">
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                <div
                    className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <h3 className="font-semibold text-gray-900 text-lg">
                                Trazabilidad — {assigneeName}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {stories.length} historia{stories.length !== 1 ? "s" : ""} · Cambios de estado con fechas
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                <span className="ml-3 text-sm text-gray-500">Cargando trazabilidad...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stories.map((story) => {
                                    const changes = historyData?.[story.jira_key] || [];
                                    return (
                                        <div key={story.jira_key} className="border border-gray-100 rounded-xl p-4">
                                            {/* Story header */}
                                            <div className="flex items-center gap-3 mb-3">
                                                <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                                                    {story.jira_key}
                                                </span>
                                                <span className="text-sm text-gray-700 truncate flex-1" title={story.summary}>
                                                    {story.summary}
                                                </span>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded-md`} style={{ backgroundColor: getStatusColor(story.status) + "20", color: getStatusColor(story.status) }}>
                                                    {story.status}
                                                </span>
                                            </div>

                                            {/* Timeline chart */}
                                            {changes.length === 0 ? (
                                                <p className="text-xs text-gray-300 italic">Sin historial de cambios</p>
                                            ) : (
                                                <div className="relative">
                                                    {/* Horizontal timeline bar */}
                                                    <div className="flex items-stretch rounded-lg overflow-hidden h-8 bg-gray-50 border border-gray-100">
                                                        {changes.map((c, idx) => {
                                                            const color = getStatusColor(c.new_status);
                                                            const widthPct = 100 / changes.length;
                                                            return (
                                                                <div
                                                                    key={c.id}
                                                                    className="relative group flex items-center justify-center text-[10px] font-medium text-white transition-all hover:opacity-90 cursor-default"
                                                                    style={{
                                                                        width: `${widthPct}%`,
                                                                        backgroundColor: color,
                                                                        minWidth: "30px",
                                                                    }}
                                                                    title={`${c.old_status || "—"} → ${c.new_status}\n${formatDate(c.changed_at)}`}
                                                                >
                                                                    <span className="truncate px-1">{idx + 1}</span>
                                                                    {/* Tooltip */}
                                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                                                        <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-lg">
                                                                            <div className="font-semibold mb-0.5">
                                                                                {c.old_status || "Inicio"} → {c.new_status}
                                                                            </div>
                                                                            <div className="text-gray-300">{formatDate(c.changed_at)}</div>
                                                                        </div>
                                                                        <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Date labels */}
                                                    <div className="flex justify-between mt-1">
                                                        <span className="text-[10px] text-gray-400">{formatDateShort(changes[0]?.changed_at)}</span>
                                                        {changes.length > 1 && (
                                                            <span className="text-[10px] text-gray-400">{formatDateShort(changes[changes.length - 1]?.changed_at)}</span>
                                                        )}
                                                    </div>

                                                    {/* Legend of transitions */}
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                                                        {changes.map((c, idx) => (
                                                            <div key={c.id} className="flex items-center gap-1 text-[10px] text-gray-500">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor(c.new_status) }} />
                                                                <span className="font-medium">{idx + 1}.</span>
                                                                <span>{c.new_status}</span>
                                                                <span className="text-gray-300">({formatDateShort(c.changed_at)})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Table ─────────────────────────────────────────────
export default function ReportesTable({ tickets = [], nombres = [] }) {
    const [selectedSprint, setSelectedSprint] = useState("");
    const [traceModal, setTraceModal] = useState(null); // { assigneeName, stories }

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
                map[realName] = { assignee: realName, total: 0 };
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

        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [filtered, nameMap]);

    // Totales por columna
    const totals = useMemo(() => {
        const t = { total: 0 };
        STATUS_COLUMNS.forEach((col) => { t[col.key] = 0; });
        pivotData.forEach((row) => {
            t.total += row.total;
            STATUS_COLUMNS.forEach((col) => { t[col.key] += row[col.key]; });
        });
        return t;
    }, [pivotData]);

    // Open traceability modal for a given assignee
    function openTrace(assigneeName) {
        // Find all stories for this assignee
        const storiesForAssignee = filtered.filter((t) => {
            const resolved = resolveName(t.assignee_name);
            return resolved === assigneeName;
        });
        setTraceModal({ assigneeName, stories: storiesForAssignee });
    }

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

                    {/* Sprint filter */}
                    <div className="flex items-center gap-2">
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

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="text-left px-5 py-3 font-semibold text-gray-700" style={{ minWidth: "180px" }}>
                                    Integrante
                                </th>
                                {STATUS_COLUMNS.map((col) => (
                                    <th key={col.key} className="text-center px-3 py-3 font-medium text-gray-500" style={{ minWidth: "110px" }}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="text-center px-4 py-3 font-semibold text-gray-700" style={{ minWidth: "120px" }}>
                                    Total
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
                                        <tr key={row.assignee} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">
                                                {row.assignee}
                                            </td>
                                            {STATUS_COLUMNS.map((col) => (
                                                <td key={col.key} className="px-3 py-3 text-center">
                                                    {row[col.key] > 0 ? (
                                                        <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                            {row[col.key]}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-200 text-xs">0</span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-center">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">
                                                        {row.total}
                                                    </span>
                                                    <button
                                                        onClick={() => openTrace(row.assignee)}
                                                        className="p-1 rounded-md hover:bg-orange-50 text-gray-400 hover:text-orange-600 transition-colors"
                                                        title="Ver trazabilidad"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Totals row */}
                                    <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold">
                                        <td className="px-5 py-3 text-gray-700">TOTAL</td>
                                        {STATUS_COLUMNS.map((col) => (
                                            <td key={col.key} className="px-3 py-3 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[col.key]}`}>
                                                    {totals[col.key]}
                                                </span>
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-sm font-bold bg-orange-500 text-white">
                                                {totals.total}
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
        </>
    );
}
