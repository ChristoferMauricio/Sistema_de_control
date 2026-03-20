"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/utils";
import * as XLSX from "xlsx";

import { useTicketData } from "./ticket-table/useTicketData";
import TicketRow    from "./ticket-table/TicketRow";
import CommentModal from "./ticket-table/CommentModal";

const PAGE_SIZE = 15;

// ─── Sub-componentes de UI (solo se usan en este archivo) ───────────────────

function SortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return null;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 ml-1 inline text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
    </svg>
  );
}

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`
        w-full mt-1 px-1.5 py-1 rounded-md text-[11px] border
        focus:outline-none focus:ring-1 focus:ring-orange-400 transition-colors cursor-pointer
        ${value
          ? "bg-orange-50 border-orange-300 text-orange-700 font-medium"
          : "bg-white border-gray-200 text-gray-500"
        }
      `}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function TicketTable({
  tickets = [],
  title,
  showAssignee = true,
  statusHistory = {},
  mode = "default",
  externalFilterType = "",
  defaultFilterSprint = "",
  syncVersion = 0,
}) {
  // ── Estado de UI local ─────────────────────────────────────────────────────
  const [expandedRow,    setExpandedRow]    = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [savingComment,  setSavingComment]  = useState(false);
  const [localComments,  setLocalComments]  = useState({});

  // ── Scrollbar dual ─────────────────────────────────────────────────────────
  const topScrollRef    = useRef(null);
  const bottomScrollRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const isSyncing = useRef(false);

  const handleTopScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (bottomScrollRef.current && topScrollRef.current)
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    isSyncing.current = false;
  }, []);

  const handleBottomScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (topScrollRef.current && bottomScrollRef.current)
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    isSyncing.current = false;
  }, []);

  useEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const updateWidth = () => setScrollWidth(el.scrollWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Hook de datos / filtros ────────────────────────────────────────────────
  const data = useTicketData({ tickets, externalFilterType, defaultFilterSprint, localComments, syncVersion });
  const {
    search, setSearch,
    filterType, setFilterType, filterSprint, setFilterSprint,
    filterStatus, setFilterStatus, filterAssignee, setFilterAssignee,
    filterReporter, setFilterReporter, filterKey, setFilterKey,
    filterSummary, setFilterSummary, filterPrincipal, setFilterPrincipal,
    filterEpic, setFilterEpic, filterComentario, setFilterComentario,
    sortField, sortDir, toggleSort,
    currentPage, setCurrentPage, totalPages, paginated, filtered,
    activeFilterCount, clearAllFilters,
    resolveName, resolveEpic,
    uniqueTypes, uniqueSprints, uniqueStatuses, uniqueAssignees, uniqueReporters,
    subtasksMap, linksMap,
  } = data;

  // ── Guardar comentario ─────────────────────────────────────────────────────
  const handleSaveComment = async () => {
    if (!editingComment) return;
    setSavingComment(true);
    try {
      const res = await fetch("/api/save-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jira_key: editingComment.key, comentario: editingComment.currentText }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Error al guardar");
      setLocalComments((prev) => ({ ...prev, [editingComment.key]: editingComment.currentText }));
      setEditingComment(null);
    } catch (err) {
      console.error("Error saving comment:", err);
      alert("Hubo un error guardando el comentario. Revisa la consola.");
    } finally {
      setSavingComment(false);
    }
  };

  // ── Exportar a Excel ───────────────────────────────────────────────────────
  function exportToExcel(dataSet, fileName) {
    const rows = dataSet.map((t) => ({
      "Tipo":             t.issue_type || "",
      "Observaciones":   localComments[t.jira_key] !== undefined ? localComments[t.jira_key] : (t.comentario || ""),
      "Clave":            t.jira_key || "",
      "Resumen":          t.summary || "",
      "Subtareas":        "",
      "Principal":        t.parent_key || "",
      "Épica":            resolveEpic(t)?.summary || "",
      "Sprint":           t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      "Story Points":     t.story_points ?? "",
      "Estado":           t.status || "",
      "Informador":       resolveName(t.reporter_email),
      "Creada":           t.created_at ? formatDate(t.created_at) : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.min(Math.max(key.length, ...rows.map((r) => String(r[key] || "").length)) + 2, 50),
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets");
    XLSX.writeFile(wb, fileName);
    setShowExportMenu(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">
            {title || "Tickets"}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            {activeFilterCount > 0 && (
              <span className="ml-1 text-orange-500">
                ({activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} activo{activeFilterCount !== 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Exportar */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar Excel
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform ${showExportMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1 animate-fade-in">
                  <button
                    onClick={() => exportToExcel(tickets, "tickets_todos.xlsx")}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <div>
                      <p className="font-medium">Exportar todo</p>
                      <p className="text-xs text-gray-400">{tickets.length} tickets</p>
                    </div>
                  </button>
                  <button
                    onClick={() => exportToExcel(filtered, "tickets_filtrados.xlsx")}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <div>
                      <p className="font-medium">Exportar filtrado</p>
                      <p className="text-xs text-gray-400">{filtered.length} tickets</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Limpiar filtros */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar filtros
            </button>
          )}

          {/* Búsqueda global */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tickets..."
              className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* ── Scrollbar superior ── */}
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto border-b border-gray-100"
        style={{ height: "12px" }}
      >
        <div style={{ width: scrollWidth, height: "1px" }} />
      </div>

      {/* ── Tabla ── */}
      <div ref={bottomScrollRef} onScroll={handleBottomScroll} className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "1200px" }}>

          {/* ── Thead: cabeceras + fila de filtros ── */}
          <thead className="text-xs uppercase bg-gray-50/80 text-gray-500 font-semibold sticky top-0 z-10 font-[family-name:var(--font-heading)] backdrop-blur-sm">
            <tr>
              {mode === "errores" && (
                <th onClick={() => toggleSort("jira_key")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "100px" }}>
                  Código <SortIcon field="jira_key" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("issue_type")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "120px" }}>
                  Tipo <SortIcon field="issue_type" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("comentario")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "250px" }}>
                  Observaciones <SortIcon field="comentario" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("jira_key")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "90px" }}>
                  Clave <SortIcon field="jira_key" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("summary")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors min-w-[200px]">
                  Resumen <SortIcon field="summary" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && <th className="px-4 py-3 font-medium min-w-[120px]">Subtareas</th>}
              <th className="px-4 py-3 font-medium min-w-[120px]">
                {mode === "errores" ? "Actividades vinculadas" : "Principal"}
              </th>
              {mode === "errores" && (
                <th onClick={() => toggleSort("storySprint")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "120px" }}>
                  Sprint Historia <SortIcon field="storySprint" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("epic")} className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "160px" }}>
                  Épica <SortIcon field="epic" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && (
                <th onClick={() => toggleSort("sprint")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "90px" }}>
                  Sprint <SortIcon field="sprint" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {showAssignee && (
                <th onClick={() => toggleSort("assignee_name")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "140px" }}>
                  Persona asignada <SortIcon field="assignee_name" sortField={sortField} sortDir={sortDir} />
                </th>
              )}
              {mode !== "errores" && <th className="px-4 py-3 font-medium text-center whitespace-nowrap" style={{ minWidth: "70px" }}>SP</th>}
              <th onClick={() => toggleSort("status")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "100px" }}>
                Estado <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
              </th>
              <th onClick={() => toggleSort("reporter_name")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "140px" }}>
                Informador <SortIcon field="reporter_name" sortField={sortField} sortDir={sortDir} />
              </th>
              <th onClick={() => toggleSort("created_at")} className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap" style={{ minWidth: "90px" }}>
                {mode === "errores" ? "Fecha de Creación" : "Creada"} <SortIcon field="created_at" sortField={sortField} sortDir={sortDir} />
              </th>
              {mode !== "errores" && (
                <th className="text-center px-4 py-3 font-medium whitespace-nowrap" style={{ minWidth: "70px" }}>Historial</th>
              )}
            </tr>

            {/* Fila de filtros */}
            <tr className="border-b border-gray-100 bg-gray-50/30">
              {mode === "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterKey} onChange={(e) => setFilterKey(e.target.value)} placeholder="Buscar..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <FilterSelect value={filterType} onChange={setFilterType} options={uniqueTypes} placeholder="Todos" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterComentario} onChange={(e) => setFilterComentario(e.target.value)} placeholder="Buscar observación..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[150px]" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterKey} onChange={(e) => setFilterKey(e.target.value)} placeholder="Buscar..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterSummary} onChange={(e) => setFilterSummary(e.target.value)} placeholder="Buscar..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[120px]" />
                </th>
              )}
              {mode !== "errores" && <th className="px-4 py-2" />}
              <th className="px-4 py-2">
                <input type="text" value={filterPrincipal} onChange={(e) => setFilterPrincipal(e.target.value)} placeholder="Buscar..."
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]" />
              </th>
              {mode === "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterSprint} onChange={(e) => setFilterSprint(e.target.value)} placeholder="Filtrar sprint..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <input type="text" value={filterEpic} onChange={(e) => setFilterEpic(e.target.value)} placeholder="Buscar..."
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[120px]" />
                </th>
              )}
              {mode !== "errores" && (
                <th className="px-4 py-2">
                  <FilterSelect value={filterSprint} onChange={setFilterSprint} options={uniqueSprints} placeholder="Todos" />
                </th>
              )}
              {showAssignee && (
                <th className="px-4 py-2">
                  <FilterSelect value={filterAssignee} onChange={setFilterAssignee} options={uniqueAssignees} placeholder="Todos" />
                </th>
              )}
              {mode !== "errores" && <th className="px-4 py-2" />}
              <th className="px-4 py-2">
                <FilterSelect value={filterStatus} onChange={setFilterStatus} options={uniqueStatuses} placeholder="Todos" />
              </th>
              <th className="px-4 py-2">
                <FilterSelect value={filterReporter} onChange={setFilterReporter} options={uniqueReporters} placeholder="Todos" />
              </th>
              <th className="px-4 py-2" />
              {mode !== "errores" && <th className="px-4 py-2" />}
            </tr>
          </thead>

          {/* ── Tbody ── */}
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p>No se encontraron tickets</p>
                    {activeFilterCount > 0 && (
                      <button onClick={clearAllFilters} className="text-orange-500 hover:text-orange-600 text-xs font-medium mt-1">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((ticket) => (
                <TicketRow
                  key={ticket.id || ticket.jira_key}
                  ticket={ticket}
                  isExpanded={expandedRow === ticket.jira_key}
                  onToggleExpand={(key) => setExpandedRow(expandedRow === key ? null : key)}
                  history={statusHistory[ticket.jira_key] || []}
                  showAssignee={showAssignee}
                  mode={mode}
                  resolveEpic={resolveEpic}
                  resolveName={resolveName}
                  localComments={localComments}
                  onEditComment={setEditingComment}
                  subtasksMap={subtasksMap}
                  linksMap={linksMap}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de edición de comentario ── */}
      <CommentModal
        editingComment={editingComment}
        onClose={() => setEditingComment(null)}
        onChange={(val) => setEditingComment((prev) => ({ ...prev, currentText: val }))}
        onSave={handleSaveComment}
        savingComment={savingComment}
      />
    </div>
  );
}
