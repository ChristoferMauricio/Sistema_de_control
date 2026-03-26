/**
 * @file errores-estadisticas/page.js - Página de estadísticas de errores e historias
 * @description Muestra gráficos de barras con la distribución de historias y errores
 *              por integrante del equipo, tanto por informador (reporter) como por asignado (assignee).
 *              Los datos provienen del tablero PF3QA en Jira.
 *
 *              Funcionalidades principales:
 *              - Filtro por sprint (selector desplegable)
 *              - Filtros toggle por tipo: Historias, Errores, Excluidos (prueba/revisión)
 *              - Gráficos de barras interactivos (click para ver detalle en modal)
 *              - Modal de detalle con lista de tickets y sus actividades vinculadas
 *              - Clasificación de estados: Por hacer, En curso, Listo para dev, QA, Finalizada
 *              - Resolución de nombres: email → nombre completo del integrante
 *
 *              Componentes internos:
 *              - DetailModal: Modal con lista de tickets filtrados por persona y tipo
 *              - BarChart: Gráfico de barras horizontales con leyenda y estados
 *
 * @route /dashboard/errores-estadisticas
 * @requires supabase - Cliente de Supabase para consultar tickets, links, equipo y personas
 * @requires sortSprints - Utilidad para ordenar sprints por número de iteración
 */
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { sortSprints } from "@/lib/utils";
import { Download } from "lucide-react";
import { exportUnifiedExcel } from "@/lib/exportExcel";

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES Y CONFIGURACIÓN
   ═══════════════════════════════════════════════════════════════════ */

/** Tipos de issue que se consideran "errores" en Jira */
const ERROR_TYPES = ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"];

/** Patrón regex para excluir tickets de prueba/revisión de los conteos principales */
const EXCLUDE_PATTERN = /prueba|revisión|revision/i;

/** URL base de Jira para construir links directos a tickets */
const JIRA_BASE = "https://supervisorservicio2020.atlassian.net/browse";

/**
 * Definiciones de estados para clasificar tickets.
 * Cada estado tiene: clave interna, etiqueta visual, patrones de matching y color CSS.
 */
const STATUS_DEFS = [
  { key: "por_hacer", label: "Por hacer", match: ["tareas por hacer", "por hacer"], color: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
  { key: "en_curso", label: "En curso", match: ["en curso", "in progress", "en progreso"], color: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300" },
  { key: "listo_dev", label: "Listo para dev", match: ["listo para dev"], color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300" },
  { key: "qa", label: "QA en dev o cert", match: ["control de calidad", "qa en dev", "qa en dev o cert"], color: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" },
  { key: "finalizada", label: "Finalizada", match: ["finalizada", "listo (pase a cert)", "listo (pase a cert o prod)", "terminada", "done", "cerrado", "resuelto", "cerrada"], color: "bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300" },
];

/**
 * Clasifica un estado de Jira en una de las categorías definidas en STATUS_DEFS.
 * Busca coincidencia parcial (includes) contra los patrones de cada definición.
 *
 * @param {string} status - Estado del ticket en Jira
 * @returns {string} Clave del estado clasificado (ej: "por_hacer", "en_curso", "finalizada")
 */
function classifyStatus(status) {
  const s = (status || "").toLowerCase();
  for (const def of STATUS_DEFS) {
    if (def.match.some((m) => s.includes(m))) return def.key;
  }
  return "por_hacer"; // Por defecto si no coincide con ningún patrón
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE: Modal de Detalle
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Modal que muestra la lista detallada de tickets al hacer click en una barra del gráfico.
 * Cada ticket muestra: clave Jira (con link), resumen, tipo, estado y actividades vinculadas.
 *
 * @param {Object} props
 * @param {string} props.title - Título del modal (ej: "Historias", "Errores")
 * @param {string} props.personName - Nombre del integrante seleccionado
 * @param {Array} props.items - Lista de tickets a mostrar
 * @param {Object} props.linksMap - Mapa de vínculos: source_key → [{target_key, link_type}]
 * @param {Object} props.allTicketMap - Mapa de todos los tickets por jira_key para lookup rápido
 * @param {Function} props.onClose - Callback para cerrar el modal
 * @returns {JSX.Element} Modal con overlay oscuro y lista de tickets
 */
function DetailModal({ title, personName, items, linksMap, allTicketMap, onClose }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">{title}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {personName} · {items.length} ticket{items.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
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
                const isError = ERROR_TYPES.includes(ticket.issue_type);
                const statusLower = (ticket.status || "").toLowerCase();
                const isCompleted = statusLower.includes("finalizada") || statusLower.includes("terminada") || statusLower.includes("cerrado") || statusLower.includes("done");
                const linkedKeys = linksMap[ticket.jira_key] || [];

                return (
                  <div key={ticket.jira_key} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-gray-300 dark:border-gray-600">
                    {/* Ticket header */}
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
                        <div className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{ticket.summary}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            isError
                              ? "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800"
                              : "bg-sky-50 text-sky-600 border border-sky-200 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-800"
                          }`}>
                            {ticket.issue_type}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                            isCompleted
                              ? "bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800"
                              : "bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800"
                          }`}>
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Linked activities */}
                    {linkedKeys.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                          Actividades vinculadas ({linkedKeys.length})
                        </p>
                        <div className="space-y-1.5">
                          {linkedKeys.map((lk) => {
                            const linked = allTicketMap[lk.target_key];
                            return (
                              <div key={`${ticket.jira_key}-${lk.target_key}`} className="flex items-start gap-2 text-xs">
                                <span className="text-gray-400 italic shrink-0 pt-0.5">{lk.link_type}</span>
                                <div className="min-w-0">
                                  <a
                                    href={`${JIRA_BASE}/${lk.target_key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                  >
                                    {lk.target_key}
                                  </a>
                                  {linked && (
                                    <span className="ml-1.5 text-indigo-500/80 dark:text-indigo-400/80">{linked.summary}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE: Tabla de Estadísticas
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Tabla que muestra historias y errores por integrante con desglose por estado.
 * Columnas: Integrante | [Estados...] | Historias | Errores | Excluidos | TOTAL
 * Las celdas de Historias/Errores/Excluidos son clicables para abrir el modal.
 *
 * @param {Object} props
 * @param {string} props.title - Título de la tabla
 * @param {string} [props.subtitle] - Subtítulo opcional
 * @param {Array} props.data - Datos agrupados por persona
 * @param {Function} props.onBarClick - Callback: (personName, type) => void
 * @param {boolean} props.showExcluidos - Si mostrar la columna de excluidos
 */
function StatsTable({ title, subtitle, data, onBarClick, onStatusClick, showExcluidos, visibleStatuses }) {
  const statusDefs = visibleStatuses ? STATUS_DEFS.filter((sd) => visibleStatuses.includes(sd.key)) : STATUS_DEFS;
  if (!data.length) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">Sin datos disponibles</div>
      </div>
    );
  }

  // Totales
  const totals = { historias: 0, errores: 0, excluidos: 0, historiasStatus: {}, erroresStatus: {} };
  statusDefs.forEach((sd) => { totals.historiasStatus[sd.key] = 0; totals.erroresStatus[sd.key] = 0; });
  data.forEach((row) => {
    totals.historias += row.historias;
    totals.errores += row.errores;
    totals.excluidos += row.excluidos;
    statusDefs.forEach((sd) => {
      totals.historiasStatus[sd.key] += (row.historiasStatus[sd.key] || 0);
      totals.erroresStatus[sd.key] += (row.erroresStatus[sd.key] || 0);
    });
  });
  const grandTotal = totals.historias + totals.errores + totals.excluidos;

  /** Renderiza una celda de estado clicable */
  const StatusCell = ({ count, statusKey, personName, type }) => {
    if (count <= 0) return <span className="text-gray-200 dark:text-gray-600 text-xs">0</span>;
    const sd = statusDefs.find((s) => s.key === statusKey);
    return (
      <button
        onClick={() => onStatusClick && onStatusClick(personName, type, statusKey)}
        className={`inline-flex items-center justify-center min-w-[22px] px-1 py-0.5 rounded text-[10px] font-bold ${sd?.color || ""} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 dark:hover:ring-gray-500 dark:ring-offset-gray-900 transition-all cursor-pointer`}
      >
        {count}
      </button>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-fade-in">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/80">
              <th className="text-left px-4 py-2 font-semibold text-gray-700 dark:text-gray-300 border-r-2 border-gray-300 dark:border-gray-500" style={{ minWidth: "150px" }}>Integrante</th>
              <th colSpan={statusDefs.length} className="text-center px-2 py-1 border-t-2 border-sky-300 dark:border-sky-600">
                <div className="flex items-center justify-center gap-1.5 text-sky-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="text-xs font-semibold">Historias</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 border-l-2 border-sky-300 dark:border-sky-600 border-t-2 border-r-2 font-semibold text-sky-700 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-900/20" style={{ minWidth: "50px" }}>
                <span className="text-xs">Sub</span>
              </th>
              <th colSpan={statusDefs.length} className="text-center px-2 py-1 border-t-2 border-red-300 dark:border-red-600">
                <div className="flex items-center justify-center gap-1.5 text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-semibold">Errores</span>
                </div>
              </th>
              <th className="text-center px-2 py-2 border-l-2 border-red-300 dark:border-red-600 border-t-2 border-r-2 font-semibold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20" style={{ minWidth: "50px" }}>
                <span className="text-xs">Sub</span>
              </th>
              {showExcluidos && (
                <th className="text-center px-2 py-2 border-l-2 border-amber-300 dark:border-amber-600 border-t-2 border-r-2 font-semibold text-amber-600 dark:text-amber-400" style={{ minWidth: "50px" }}>
                  <span className="text-xs">Excl.</span>
                </th>
              )}
              <th className="text-center px-3 py-2 border-l-2 border-orange-300 dark:border-orange-600 border-t-2 border-r-2 font-bold text-gray-900 dark:text-gray-100 bg-orange-50/50 dark:bg-orange-900/20" style={{ minWidth: "55px" }}>TOTAL</th>
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50/40 dark:bg-gray-800/40">
              <th className="border-r-2 border-gray-300 dark:border-gray-500" />
              {statusDefs.map((sd, i) => (
                <th key={`h-${sd.key}`} className={`text-center px-1 py-1 ${i === 0 ? "border-l-2 border-l-sky-300 dark:border-l-sky-600" : "border-l border-gray-100 dark:border-gray-700"}`}>
                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold ${sd.color}`}>
                    {sd.label.replace("Listo para dev", "Dev").replace("Por hacer", "P.Hacer")}
                  </span>
                </th>
              ))}
              <th className="border-l-2 border-r-2 border-sky-300 dark:border-sky-600" />
              {statusDefs.map((sd, i) => (
                <th key={`e-${sd.key}`} className={`text-center px-1 py-1 ${i === 0 ? "border-l-2 border-l-red-300 dark:border-l-red-600" : "border-l border-gray-100 dark:border-gray-700"}`}>
                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold ${sd.color}`}>
                    {sd.label.replace("Listo para dev", "Dev").replace("Por hacer", "P.Hacer")}
                  </span>
                </th>
              ))}
              <th className="border-l-2 border-r-2 border-red-300 dark:border-red-600" />
              {showExcluidos && <th className="border-l-2 border-r-2 border-amber-300 dark:border-amber-600" />}
              <th className="border-l-2 border-r-2 border-orange-300 dark:border-orange-600" />
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const rowTotal = row.historias + row.errores + row.excluidos;
              return (
                <tr key={row.name} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap border-r-2 border-gray-300 dark:border-gray-500">{row.name}</td>
                  {statusDefs.map((sd, i) => (
                    <td key={`h-${sd.key}`} className={`px-1 py-2 text-center ${i === 0 ? "border-l-2 border-l-sky-300 dark:border-l-sky-600" : "border-l border-gray-100 dark:border-gray-700"}`}>
                      <StatusCell count={row.historiasStatus[sd.key] || 0} statusKey={sd.key} personName={row.name} type="Historia" />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center border-l-2 border-r-2 border-sky-300 dark:border-sky-600 bg-sky-50/30 dark:bg-sky-900/20">
                    {row.historias > 0 ? (
                      <button onClick={() => onBarClick(row.name, "Historia")} className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-sky-100 text-sky-700 border border-sky-200 hover:bg-sky-200 dark:bg-sky-900/60 dark:text-sky-300 dark:border-sky-700 dark:hover:bg-sky-800/80 transition-colors cursor-pointer">
                        {row.historias}
                      </button>
                    ) : (
                      <span className="text-gray-200 dark:text-gray-600 text-xs">0</span>
                    )}
                  </td>
                  {statusDefs.map((sd, i) => (
                    <td key={`e-${sd.key}`} className={`px-1 py-2 text-center ${i === 0 ? "border-l-2 border-l-red-300 dark:border-l-red-600" : "border-l border-gray-100 dark:border-gray-700"}`}>
                      <StatusCell count={row.erroresStatus[sd.key] || 0} statusKey={sd.key} personName={row.name} type="Error" />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center border-l-2 border-r-2 border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-900/20">
                    {row.errores > 0 ? (
                      <button onClick={() => onBarClick(row.name, "Error")} className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-red-900/60 dark:text-red-300 dark:border-red-700 dark:hover:bg-red-800/80 transition-colors cursor-pointer">
                        {row.errores}
                      </button>
                    ) : (
                      <span className="text-gray-200 dark:text-gray-600 text-xs">0</span>
                    )}
                  </td>
                  {showExcluidos && (
                    <td className="px-2 py-2 text-center border-l-2 border-r-2 border-amber-300 dark:border-amber-600">
                      {row.excluidos > 0 ? (
                        <button onClick={() => onBarClick(row.name, "Excluido")} className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-800/80 transition-colors cursor-pointer">
                          {row.excluidos}
                        </button>
                      ) : (
                        <span className="text-gray-200 dark:text-gray-600 text-xs">0</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center border-l-2 border-r-2 border-orange-300 dark:border-orange-600 bg-gray-50/50 dark:bg-gray-800/50">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-lg text-xs font-bold text-gray-800 dark:text-gray-200">{rowTotal}</span>
                  </td>
                </tr>
              );
            })}
            {/* Fila TOTAL */}
            <tr className="border-t-2 border-gray-300 dark:border-gray-500 bg-gray-50/80 dark:bg-gray-800/80 font-semibold">
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300 border-r-2 border-gray-300 dark:border-gray-500">TOTAL</td>
              {statusDefs.map((sd, i) => (
                <td key={`th-${sd.key}`} className={`px-1 py-2 text-center ${i === 0 ? "border-l-2 border-l-sky-300 dark:border-l-sky-600 border-b-2 border-b-sky-300 dark:border-b-sky-600" : "border-l border-gray-100 dark:border-gray-700 border-b-2 border-b-sky-300 dark:border-b-sky-600"}`}>
                  <div className="flex flex-col items-center">
                    <span className={`inline-flex items-center justify-center min-w-[22px] px-1 py-0.5 rounded text-[10px] font-bold ${sd.color}`}>
                      {totals.historiasStatus[sd.key]}
                    </span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500">{totals.historias > 0 ? Math.round(totals.historiasStatus[sd.key] / totals.historias * 100) : 0}%</span>
                  </div>
                </td>
              ))}
              <td className="px-2 py-2 text-center border-l-2 border-r-2 border-b-2 border-sky-300 dark:border-sky-600 bg-sky-50/30 dark:bg-sky-900/20">
                <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-sky-200 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300">{totals.historias}</span>
              </td>
              {statusDefs.map((sd, i) => (
                <td key={`te-${sd.key}`} className={`px-1 py-2 text-center ${i === 0 ? "border-l-2 border-l-red-300 dark:border-l-red-600 border-b-2 border-b-red-300 dark:border-b-red-600" : "border-l border-gray-100 dark:border-gray-700 border-b-2 border-b-red-300 dark:border-b-red-600"}`}>
                  <div className="flex flex-col items-center">
                    <span className={`inline-flex items-center justify-center min-w-[22px] px-1 py-0.5 rounded text-[10px] font-bold ${sd.color}`}>
                      {totals.erroresStatus[sd.key]}
                    </span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-500">{totals.errores > 0 ? Math.round(totals.erroresStatus[sd.key] / totals.errores * 100) : 0}%</span>
                  </div>
                </td>
              ))}
              <td className="px-2 py-2 text-center border-l-2 border-r-2 border-b-2 border-red-300 dark:border-red-600 bg-red-50/30 dark:bg-red-900/20">
                <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300">{totals.errores}</span>
              </td>
              {showExcluidos && (
                <td className="px-2 py-2 text-center border-l-2 border-r-2 border-b-2 border-amber-300 dark:border-amber-600">
                  <span className="inline-flex items-center justify-center min-w-[26px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">{totals.excluidos}</span>
                </td>
              )}
              <td className="px-3 py-2 text-center border-l-2 border-r-2 border-b-2 border-orange-300 dark:border-orange-600 bg-gray-100 dark:bg-gray-700/50">
                <span className="inline-flex items-center justify-center min-w-[30px] px-2 py-0.5 rounded-lg text-sm font-bold text-gray-900 dark:text-gray-100">{grandTotal}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL: Página de Estadísticas de Errores
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Página principal de estadísticas. Carga datos del tablero PF3QA y genera
 * dos gráficos de barras: uno por informador y otro por asignado.
 * Permite filtrar por sprint y por tipo de ticket (Historia/Error/Excluido).
 *
 * @returns {JSX.Element} Página con filtros, badges de conteo, gráficos y modal de detalle
 */
export default function ErroresEstadisticasPage() {
  /* ─── Estados de datos ─── */
  const [tickets, setTickets] = useState([]);         // Tickets del tablero PF3QA
  const [linkedTickets, setLinkedTickets] = useState([]); // Tickets externos vinculados (PF3-XXX)
  const [links, setLinks] = useState([]);              // Vínculos entre tickets
  const [equipo, setEquipo] = useState([]);            // Datos del equipo de desarrollo
  const [persons, setPersons] = useState([]);          // Datos de personas de Jira
  const [loading, setLoading] = useState(true);

  /* ─── Estados de filtros ─── */
  const [selectedSprint, setSelectedSprint] = useState(null); // null = aún no inicializado
  const [activeFilters, setActiveFilters] = useState(new Set(["Historia", "Error"])); // Filtros activos por defecto

  /* ─── Estado del modal de detalle ─── */
  const [modal, setModal] = useState(null); // { title, personName, items }

  useEffect(() => {
    /**
     * Carga inicial de datos desde múltiples tablas en paralelo.
     * Obtiene: tickets PF3QA, vínculos, equipo de desarrollo y personas de Jira.
     * Luego busca los resúmenes de tickets externos vinculados.
     */
    async function fetchData() {
      // Consultas en paralelo para optimizar tiempo de carga
      const [ticketsRes, linksRes, equipoRes, personsRes] = await Promise.all([
        supabase
          .from("jira_tickets")
          .select("jira_key, summary, issue_type, status, sprint, assignee_email, reporter_email")
          .like("jira_key", "PF3QA-%"),
        supabase
          .from("jira_ticket_links")
          .select("source_key, target_key, link_type")
          .like("source_key", "PF3QA-%"),
        supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
        supabase.from("jira_persons").select("email, display_name"),
      ]);

      const tix = ticketsRes.data || [];
      const lnk = linksRes.data || [];
      setTickets(tix);
      setLinks(lnk);
      setEquipo(equipoRes.data || []);
      setPersons(personsRes.data || []);

      // Obtener resúmenes de tickets vinculados externos (PF3-XXXX que no están en PF3QA)
      // Necesarios para mostrar info en el modal de detalle
      const pf3qaKeys = new Set(tix.map((t) => t.jira_key));
      const externalKeys = [...new Set(lnk.map((l) => l.target_key).filter((k) => !pf3qaKeys.has(k)))];
      if (externalKeys.length > 0) {
        const { data: extTickets } = await supabase
          .from("jira_tickets")
          .select("jira_key, summary")
          .in("jira_key", externalKeys);
        setLinkedTickets(extTickets || []);
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  /** Mapa de vínculos: source_key → [{target_key, link_type}] para acceso O(1) */
  const linksMap = useMemo(() => {
    const map = {};
    links.forEach((l) => {
      if (!map[l.source_key]) map[l.source_key] = [];
      map[l.source_key].push({ target_key: l.target_key, link_type: l.link_type });
    });
    return map;
  }, [links]);

  /** Mapa de todos los tickets (PF3QA + externos vinculados) por jira_key para lookup rápido */
  const allTicketMap = useMemo(() => {
    const map = {};
    tickets.forEach((t) => { map[t.jira_key] = t; });
    linkedTickets.forEach((t) => { if (!map[t.jira_key]) map[t.jira_key] = t; });
    return map;
  }, [tickets, linkedTickets]);

  /* ─── Mapas de resolución de nombres (email → nombre completo) ─── */

  /** Mapa: correo del equipo (PGIM/GCORP) → nombre completo */
  const equipoEmailMap = useMemo(() => {
    const map = {};
    equipo.forEach((e) => {
      if (e.correo_pgim) map[e.correo_pgim.toLowerCase()] = e.nombre;
      if (e.correo_gcorp) map[e.correo_gcorp.toLowerCase()] = e.nombre;
    });
    return map;
  }, [equipo]);

  /** Mapa: nombre_clave del equipo → nombre completo */
  const equipoKeyMap = useMemo(() => {
    const map = {};
    equipo.forEach((e) => {
      if (e.nombre_clave) map[e.nombre_clave.toLowerCase()] = e.nombre;
    });
    return map;
  }, [equipo]);

  /** Mapa: email de Jira → display_name de Jira */
  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => {
      if (p.email && p.display_name) map[p.email.toLowerCase()] = p.display_name;
    });
    return map;
  }, [persons]);

  /** Sobrescrituras manuales de nombres para casos especiales */
  const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

  /**
   * Resuelve un email a nombre completo del integrante.
   * Cadena de resolución: equipo (email) → jira_persons → equipo (nombre_clave) → email original.
   * Aplica NAME_OVERRIDES al final para casos especiales.
   *
   * @param {string} email - Email del usuario en Jira
   * @returns {string|null} Nombre resuelto o null si email está vacío
   */
  const resolveName = useCallback((email) => {
    if (!email || email.trim() === "") return null;
    const key = email.toLowerCase();
    const byEmail = equipoEmailMap[key];
    if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
    const displayName = personsMap[key] || email;
    const resolved = equipoKeyMap[displayName.toLowerCase()] || displayName;
    return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
  }, [equipoEmailMap, equipoKeyMap, personsMap]);

  /** Lista de sprints disponibles extraída de los tickets, ordenada con sortSprints */
  const sprints = useMemo(() => {
    const s = new Set();
    tickets.forEach((t) => { if (t.sprint) s.add(t.sprint); });
    return sortSprints([...s]);
  }, [tickets]);

  // Seleccionar sprint por defecto: el "Tablero Sprint" más reciente (mayor número)
  useEffect(() => {
    if (selectedSprint === null && sprints.length > 0) {
      // sprints is sorted: Iteración F3.12 desc, then Tablero Sprint 1,2,... asc
      // Pick the last Tablero Sprint (highest number) or the first Iteración
      const lastTablero = [...sprints].reverse().find((s) => /Tablero\s+Sprint/i.test(s));
      setSelectedSprint(lastTablero || sprints[0]);
    }
  }, [sprints, selectedSprint]);

  /**
   * Tickets válidos: filtrados por sprint seleccionado y tipos activos (Historia/Error/Excluido).
   * Se recalcula cuando cambian los filtros o el sprint.
   */
  const validTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (selectedSprint && t.sprint !== selectedSprint) return false;
      const isExcluded = EXCLUDE_PATTERN.test(t.summary || "");
      const isHistoria = !isExcluded && t.issue_type === "Historia";
      const isError = !isExcluded && ERROR_TYPES.includes(t.issue_type);

      if (isExcluded && activeFilters.has("Excluido")) return true;
      if (isHistoria && activeFilters.has("Historia")) return true;
      if (isError && activeFilters.has("Error")) return true;
      return false;
    });
  }, [tickets, selectedSprint, activeFilters]);

  /** Crea un mapa de contadores de estado inicializado en 0 para cada categoría */
  const emptyStatusMap = () => {
    const m = {};
    STATUS_DEFS.forEach((d) => { m[d.key] = 0; });
    return m;
  };

  /**
   * Clasifica un ticket en una categoría: "excluido", "error", "historia" o null.
   * Los tickets excluidos son aquellos cuyo resumen contiene "prueba" o "revisión".
   */
  const classifyTicket = useCallback((t) => {
    if (EXCLUDE_PATTERN.test(t.summary || "")) return "excluido";
    if (ERROR_TYPES.includes(t.issue_type)) return "error";
    if (t.issue_type === "Historia") return "historia";
    return null;
  }, []);

  /** Datos agrupados por INFORMADOR (reporter): historias, errores y excluidos con desglose por estado */
  const reporterData = useMemo(() => {
    const map = {};
    validTickets.forEach((t) => {
      const name = resolveName(t.reporter_email);
      if (!name) return;
      if (!map[name]) map[name] = { name, historias: 0, errores: 0, excluidos: 0, historiasStatus: emptyStatusMap(), erroresStatus: emptyStatusMap() };
      const cat = classifyTicket(t);
      const sk = classifyStatus(t.status);
      if (cat === "error") { map[name].errores += 1; map[name].erroresStatus[sk] += 1; }
      else if (cat === "historia") { map[name].historias += 1; map[name].historiasStatus[sk] += 1; }
      else if (cat === "excluido") { map[name].excluidos += 1; }
    });
    return Object.values(map)
      .filter((r) => r.historias + r.errores + r.excluidos > 0)
      .sort((a, b) => (b.historias + b.errores + b.excluidos) - (a.historias + a.errores + a.excluidos));
  }, [validTickets, resolveName, classifyTicket]);

  /** Datos agrupados por ASIGNADO (assignee): historias, errores y excluidos con desglose por estado */
  const assigneeData = useMemo(() => {
    const map = {};
    validTickets.forEach((t) => {
      const name = resolveName(t.assignee_email);
      if (!name) return;
      if (!map[name]) map[name] = { name, historias: 0, errores: 0, excluidos: 0, historiasStatus: emptyStatusMap(), erroresStatus: emptyStatusMap() };
      const cat = classifyTicket(t);
      const sk = classifyStatus(t.status);
      if (cat === "error") { map[name].errores += 1; map[name].erroresStatus[sk] += 1; }
      else if (cat === "historia") { map[name].historias += 1; map[name].historiasStatus[sk] += 1; }
      else if (cat === "excluido") { map[name].excluidos += 1; }
    });
    return Object.values(map)
      .filter((r) => r.historias + r.errores + r.excluidos > 0)
      .sort((a, b) => (b.historias + b.errores + b.excluidos) - (a.historias + a.errores + a.excluidos));
  }, [validTickets, resolveName, classifyTicket]);

  /** Tickets filtrados solo por sprint (sin filtro de tipo) para mostrar conteos en badges */
  const sprintTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (selectedSprint && t.sprint !== selectedSprint) return false;
      return true;
    });
  }, [tickets, selectedSprint]);

  /* ─── Totales globales (se muestran siempre, independientemente del filtro de tipo activo) ─── */
  const totalHistorias = useMemo(() => sprintTickets.filter((t) => !EXCLUDE_PATTERN.test(t.summary || "") && t.issue_type === "Historia").length, [sprintTickets]);
  const totalErrores = useMemo(() => sprintTickets.filter((t) => !EXCLUDE_PATTERN.test(t.summary || "") && ERROR_TYPES.includes(t.issue_type)).length, [sprintTickets]);
  const totalExcluidos = useMemo(() => sprintTickets.filter((t) => EXCLUDE_PATTERN.test(t.summary || "")).length, [sprintTickets]);

  /**
   * Manejador de click en barras del gráfico. Abre el modal con tickets filtrados
   * por persona, campo (reporter/assignee) y tipo (Historia/Error/Excluido).
   *
   * @param {string} field - Campo de email a comparar ("reporter_email" o "assignee_email")
   * @returns {Function} Callback que recibe (personName, type) y abre el modal
   */
  const handleBarClick = useCallback((field) => (personName, type) => {
    const items = validTickets.filter((t) => {
      const name = resolveName(t[field]);
      if (name !== personName) return false;
      if (type === "Error") return ERROR_TYPES.includes(t.issue_type) && !EXCLUDE_PATTERN.test(t.summary || "");
      if (type === "Excluido") return EXCLUDE_PATTERN.test(t.summary || "");
      return t.issue_type === "Historia" && !EXCLUDE_PATTERN.test(t.summary || "");
    });
    const titles = { Error: "Errores", Historia: "Historias", Excluido: "Excluidos (Prueba/Revisión)" };
    setModal({
      title: titles[type] || type,
      personName,
      items,
    });
  }, [validTickets, resolveName]);

  /**
   * Manejador de click en celdas de estado. Abre el modal con tickets filtrados
   * por persona, tipo (Historia/Error) y estado específico.
   */
  const handleStatusClick = useCallback((field) => (personName, type, statusKey) => {
    const statusDef = STATUS_DEFS.find((sd) => sd.key === statusKey);
    const items = validTickets.filter((t) => {
      const name = resolveName(t[field]);
      if (name !== personName) return false;
      if (classifyStatus(t.status) !== statusKey) return false;
      if (type === "Error") return ERROR_TYPES.includes(t.issue_type) && !EXCLUDE_PATTERN.test(t.summary || "");
      return t.issue_type === "Historia" && !EXCLUDE_PATTERN.test(t.summary || "");
    });
    setModal({
      title: `${type === "Error" ? "Errores" : "Historias"} — ${statusDef?.label || statusKey}`,
      personName,
      items,
    });
  }, [validTickets, resolveName]);

  /** Detecta si el sprint seleccionado es del tablero PF3QA */
  const isPF3QA = /Tablero\s+Sprint/i.test(selectedSprint || "");
  const visibleStatuses = isPF3QA ? ["por_hacer", "en_curso", "qa", "finalizada"] : null;

  /**
   * Exporta a Excel unificado con tablas dinámicas (Osi + Datos QA).
   * Delega al módulo compartido exportExcel.js
   */
  const exportToExcel = useCallback(() => {
    exportUnifiedExcel(selectedSprint);
  }, [selectedSprint]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-5 w-80" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
      {/* Header */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/40">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100">
            Estadísticas de Errores
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Distribución de historias y errores por integrante del tablero PF3QA
        </p>
      </div>

      {/* Sprint filter + Export */}
      <div className="flex items-center gap-3 animate-fade-in">
        <select
          value={selectedSprint || ""}
          onChange={(e) => setSelectedSprint(e.target.value)}
          className="px-4 py-2.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-sm text-indigo-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 dark:focus:ring-indigo-600 dark:focus:border-indigo-500 transition-colors"
        >
          <option value="">Todos los sprints</option>
          {sprints.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors dark:bg-green-700 dark:hover:bg-green-600"
          title="Descargar Reporte QA en formato Excel"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
      </div>

      {/* Stats banner - clickeable toggle filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in">
        <button
          onClick={() => {
            const next = new Set(activeFilters);
            next.has("Historia") ? next.delete("Historia") : next.add("Historia");
            setActiveFilters(next);
          }}
          className={`rounded-xl border px-5 py-3 inline-flex items-center gap-3 shadow-sm transition-all duration-200 cursor-pointer ${
            activeFilters.has("Historia")
              ? "bg-sky-50 border-sky-400 ring-2 ring-sky-200 dark:bg-sky-900/30 dark:border-sky-600 dark:ring-sky-800"
              : "bg-white border-gray-200 hover:border-sky-300 hover:bg-sky-50/50 opacity-60 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-sky-600 dark:hover:bg-sky-900/20"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{totalHistorias}</span> historia{totalHistorias !== 1 ? "s" : ""}
          </span>
        </button>
        <button
          onClick={() => {
            const next = new Set(activeFilters);
            next.has("Error") ? next.delete("Error") : next.add("Error");
            setActiveFilters(next);
          }}
          className={`rounded-xl border px-5 py-3 inline-flex items-center gap-3 shadow-sm transition-all duration-200 cursor-pointer ${
            activeFilters.has("Error")
              ? "bg-red-50 border-red-400 ring-2 ring-red-200 dark:bg-red-900/30 dark:border-red-600 dark:ring-red-800"
              : "bg-white border-gray-200 hover:border-red-300 hover:bg-red-50/50 opacity-60 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-red-600 dark:hover:bg-red-900/20"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{totalErrores}</span> error{totalErrores !== 1 ? "es" : ""}
          </span>
        </button>
        <button
          onClick={() => {
            const next = new Set(activeFilters);
            next.has("Excluido") ? next.delete("Excluido") : next.add("Excluido");
            setActiveFilters(next);
          }}
          className={`rounded-xl border px-5 py-3 inline-flex items-center gap-3 shadow-sm transition-all duration-200 cursor-pointer ${
            activeFilters.has("Excluido")
              ? "bg-amber-50 border-amber-400 ring-2 ring-amber-200 dark:bg-amber-900/30 dark:border-amber-600 dark:ring-amber-800"
              : "bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 opacity-60 dark:bg-gray-800 dark:border-gray-600 dark:hover:border-amber-600 dark:hover:bg-amber-900/20"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{totalExcluidos}</span> excluido{totalExcluidos !== 1 ? "s" : ""} (Prueba/Revisión)
          </span>
        </button>
      </div>

      {/* Tabla 1: Reporters */}
      <StatsTable
        title="Tickets creados por Informador"
        subtitle={`${reporterData.length} informador${reporterData.length !== 1 ? "es" : ""}`}
        data={reporterData}
        onBarClick={handleBarClick("reporter_email")}
        onStatusClick={handleStatusClick("reporter_email")}
        showExcluidos={activeFilters.has("Excluido")}
        visibleStatuses={visibleStatuses}
      />

      {/* Tabla 2: Assignees */}
      <StatsTable
        title="Tickets asignados por Integrante"
        subtitle={`${assigneeData.length} integrante${assigneeData.length !== 1 ? "s" : ""}`}
        data={assigneeData}
        onBarClick={handleBarClick("assignee_email")}
        onStatusClick={handleStatusClick("assignee_email")}
        showExcluidos={activeFilters.has("Excluido")}
        visibleStatuses={visibleStatuses}
      />

      {/* Detail Modal */}
      {modal && (
        <DetailModal
          title={modal.title}
          personName={modal.personName}
          items={modal.items}
          linksMap={linksMap}
          allTicketMap={allTicketMap}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
