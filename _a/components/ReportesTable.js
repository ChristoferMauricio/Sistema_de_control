"use client";

import { useState, useMemo } from "react";

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

export default function ReportesTable({ tickets = [] }) {
    const [selectedSprint, setSelectedSprint] = useState("");

    // Solo Historias
    const historias = useMemo(() => {
        return tickets.filter((t) => t.issue_type === "Historia");
    }, [tickets]);

    // Sprints disponibles (de las historias)
    const sprints = useMemo(() => {
        const s = new Set();
        historias.forEach((t) => { if (t.sprint) s.add(t.sprint); });
        return [...s].sort((a, b) => {
            // Intentar ordenar numéricamente por el número del sprint
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

    // Pivotear: agrupar por asignado, contar por estado
    const pivotData = useMemo(() => {
        const map = {};

        filtered.forEach((t) => {
            const assignee = t.assignee || "Sin asignar";
            if (!map[assignee]) {
                map[assignee] = { assignee, total: 0 };
                STATUS_COLUMNS.forEach((col) => { map[assignee][col.key] = 0; });
            }

            map[assignee].total += 1;

            const matched = STATUS_COLUMNS.find((col) =>
                col.jiraStatuses.some((s) => s.toLowerCase() === (t.status || "").toLowerCase())
            );
            if (matched) {
                map[assignee][matched.key] += 1;
            }
        });

        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [filtered]);

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

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">
                        Historias por Integrante y Estado
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
                            <th className="text-center px-4 py-3 font-semibold text-gray-700" style={{ minWidth: "70px" }}>
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
                                            <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">
                                                {row.total}
                                            </span>
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
    );
}
