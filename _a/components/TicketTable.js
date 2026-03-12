"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { formatDate, timeAgo, getStatusColor, getIssueTypeStyle, truncate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

const PAGE_SIZE = 15;

export default function TicketTable({ tickets = [], title, showAssignee = true, statusHistory = {} }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Column filters
  const [filterType, setFilterType] = useState("");
  const [filterSprint, setFilterSprint] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterReporter, setFilterReporter] = useState("");
  const [filterKey, setFilterKey] = useState("");
  const [filterSummary, setFilterSummary] = useState("");
  const [filterPrincipal, setFilterPrincipal] = useState("");
  const [nombres, setNombres] = useState([]);

  // Dual scrollbar refs
  const topScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const isSyncing = useRef(false);

  // Sync top ↔ bottom scroll
  const handleTopScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (bottomScrollRef.current && topScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    isSyncing.current = false;
  }, []);

  const handleBottomScroll = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
    isSyncing.current = false;
  }, []);

  // Measure table width for the top scrollbar
  useEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const updateWidth = () => setScrollWidth(el.scrollWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch Nombres table for reporter resolution
  useEffect(() => {
    async function fetchNombres() {
      const { data } = await supabase.from("Nombres").select("*");
      if (data) setNombres(data);
    }
    fetchNombres();
  }, []);

  // Build Programador → Nombre map
  const nameMap = useMemo(() => {
    const map = {};
    nombres.forEach((n) => {
      if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre;
    });
    return map;
  }, [nombres]);

  function resolveName(rawName) {
    if (!rawName || rawName.trim() === "") return "—";
    return nameMap[rawName.toLowerCase()] || rawName;
  }

  // Get unique values for filter dropdowns
  const uniqueTypes = useMemo(() => [...new Set(tickets.map(t => t.issue_type).filter(Boolean))].sort(), [tickets]);
  const uniqueSprints = useMemo(() => [...new Set(tickets.map(t => t.sprint).filter(Boolean))].sort(), [tickets]);
  const uniqueStatuses = useMemo(() => [...new Set(tickets.map(t => t.status).filter(Boolean))].sort(), [tickets]);
  const uniqueAssignees = useMemo(() => [...new Set(tickets.map(t => t.assignee_name).filter(Boolean))].sort(), [tickets]);
  const uniqueReporters = useMemo(() => {
    const resolved = tickets.map(t => resolveName(t.reporter_name)).filter(v => v && v !== "—");
    return [...new Set(resolved)].sort();
  }, [tickets, nameMap]);

  const activeFilterCount = [filterType, filterSprint, filterStatus, filterAssignee, filterReporter, filterKey.length >= 3 ? filterKey : "", filterSummary.length >= 3 ? filterSummary : "", filterPrincipal.length >= 3 ? filterPrincipal : ""].filter(Boolean).length;

  // Filter + Sort
  const filtered = useMemo(() => {
    let result = tickets;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.jira_key?.toLowerCase().includes(q) ||
          t.summary?.toLowerCase().includes(q) ||
          t.assignee_name?.toLowerCase().includes(q) ||
          t.status?.toLowerCase().includes(q) ||
          t.issue_type?.toLowerCase().includes(q) ||
          t.sprint?.toLowerCase().includes(q)
      );
    }

    // Apply column filters
    if (filterType) result = result.filter(t => t.issue_type === filterType);
    if (filterKey.length >= 3) result = result.filter(t => t.jira_key?.toLowerCase().includes(filterKey.toLowerCase()));
    if (filterSummary.length >= 3) result = result.filter(t => t.summary?.toLowerCase().includes(filterSummary.toLowerCase()));
    if (filterSprint) result = result.filter(t => t.sprint === filterSprint);
    if (filterStatus) result = result.filter(t => t.status === filterStatus);
    if (filterPrincipal.length >= 3) result = result.filter(t => t.parent_key?.toLowerCase().includes(filterPrincipal.toLowerCase()));
    if (filterAssignee) result = result.filter(t => t.assignee_name === filterAssignee);
    if (filterReporter) result = result.filter(t => resolveName(t.reporter_name) === filterReporter);

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [tickets, search, sortField, sortDir, filterType, filterKey, filterSummary, filterPrincipal, filterSprint, filterStatus, filterAssignee, filterReporter, nameMap]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setCurrentPage(1);
  }

  function clearAllFilters() {
    setFilterType("");
    setFilterKey("");
    setFilterSummary("");
    setFilterPrincipal("");
    setFilterSprint("");
    setFilterStatus("");
    setFilterAssignee("");
    setFilterReporter("");
    setSearch("");
    setCurrentPage(1);
  }

  // ─── Excel export ─────────────────────────────────────
  function exportToExcel(dataSet, fileName) {
    const rows = dataSet.map((t) => ({
      "Tipo": t.issue_type || "",
      "Clave": t.jira_key || "",
      "Resumen": t.summary || "",
      "Subtareas": t.subtask_keys?.join(", ") || "",
      "Principal": t.parent_key || "",
      "Sprint": t.sprint || "",
      "Persona asignada": t.assignee_name || "",
      "Story Points": t.story_points ?? "",
      "Estado": t.status || "",
      "Informador": resolveName(t.reporter_name),
      "Creada": t.created_at ? formatDate(t.created_at) : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.map((r) => String(r[key] || "").length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets");
    XLSX.writeFile(wb, fileName);
    setShowExportMenu(false);
  }

  function SortIcon({ field }) {
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
        onChange={(e) => { onChange(e.target.value); setCurrentPage(1); }}
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

  // Helpers
  const isStory = (type) => (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";
  const isSubtask = (type) => (type || "").toLowerCase().includes("subtare") || (type || "").toLowerCase().includes("sub-task") || (type || "").toLowerCase() === "subtask";
  const isEpic = (type) => (type || "").toLowerCase().includes("epic") || (type || "").toLowerCase().includes("épica");
  const hasStatusHistory = (type) => !isSubtask(type) && !isEpic(type);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
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
          {/* Export dropdown */}
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
          {/* Clear filters button */}
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

          {/* Search */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar tickets..."
              className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Top scrollbar (mirrors the bottom one) */}
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto border-b border-gray-100"
        style={{ height: "12px" }}
      >
        <div style={{ width: scrollWidth, height: "1px" }} />
      </div>

      {/* Table with bottom scrollbar */}
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto"
      >
        <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
          <thead>
            {/* Sortable header row */}
            <tr className="border-b border-gray-100 text-gray-500 bg-gray-50/50">
              <th onClick={() => toggleSort("issue_type")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "110px" }}>
                Tipo <SortIcon field="issue_type" />
              </th>
              <th onClick={() => toggleSort("jira_key")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none" style={{ minWidth: "100px" }}>
                Clave <SortIcon field="jira_key" />
              </th>
              <th onClick={() => toggleSort("summary")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none" style={{ minWidth: "200px" }}>
                Resumen <SortIcon field="summary" />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ minWidth: "100px" }}>
                Subtareas
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ minWidth: "90px" }}>
                Principal
              </th>
              <th onClick={() => toggleSort("sprint")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "130px" }}>
                Sprint <SortIcon field="sprint" />
              </th>
              {showAssignee && (
                <th onClick={() => toggleSort("assignee_name")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "130px" }}>
                  Asignado <SortIcon field="assignee_name" />
                </th>
              )}
              <th onClick={() => toggleSort("story_points")} className="text-center px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "50px" }}>
                SP <SortIcon field="story_points" />
              </th>
              <th onClick={() => toggleSort("status")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "110px" }}>
                Estado <SortIcon field="status" />
              </th>
              <th onClick={() => toggleSort("reporter_name")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "130px" }}>
                Informador <SortIcon field="reporter_name" />
              </th>
              <th onClick={() => toggleSort("created_at")} className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap" style={{ minWidth: "90px" }}>
                Creada <SortIcon field="created_at" />
              </th>
              <th className="text-center px-4 py-3 font-medium whitespace-nowrap" style={{ minWidth: "70px" }}>
                Historial
              </th>
            </tr>

            {/* Filter row */}
            <tr className="border-b border-gray-100 bg-gray-50/30">
              <th className="px-4 py-2">
                <FilterSelect value={filterType} onChange={setFilterType} options={uniqueTypes} placeholder="Todos" />
              </th>
              <th className="px-4 py-2">
                <input
                  type="text"
                  value={filterKey}
                  onChange={(e) => { setFilterKey(e.target.value); setCurrentPage(1); }}
                  placeholder="Buscar..."
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]"
                />
              </th>
              <th className="px-4 py-2">
                <input
                  type="text"
                  value={filterSummary}
                  onChange={(e) => { setFilterSummary(e.target.value); setCurrentPage(1); }}
                  placeholder="Buscar..."
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[120px]"
                />
              </th>
              <th className="px-4 py-2" /> {/* Subtareas */}
              <th className="px-4 py-2">
                <input
                  type="text"
                  value={filterPrincipal}
                  onChange={(e) => { setFilterPrincipal(e.target.value); setCurrentPage(1); }}
                  placeholder="Buscar..."
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 min-w-[80px]"
                />
              </th>
              <th className="px-4 py-2">
                <FilterSelect value={filterSprint} onChange={setFilterSprint} options={uniqueSprints} placeholder="Todos" />
              </th>
              {showAssignee && (
                <th className="px-4 py-2">
                  <FilterSelect value={filterAssignee} onChange={setFilterAssignee} options={uniqueAssignees} placeholder="Todos" />
                </th>
              )}
              <th className="px-4 py-2" /> {/* SP */}
              <th className="px-4 py-2">
                <FilterSelect value={filterStatus} onChange={setFilterStatus} options={uniqueStatuses} placeholder="Todos" />
              </th>
              <th className="px-4 py-2">
                <FilterSelect value={filterReporter} onChange={setFilterReporter} options={uniqueReporters} placeholder="Todos" />
              </th>
              <th className="px-4 py-2" /> {/* Creada */}
              <th className="px-4 py-2" /> {/* Historial */}
            </tr>
          </thead>
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
              paginated.map((ticket) => {
                const statusColor = getStatusColor(ticket.status);
                const typeStyle = getIssueTypeStyle(ticket.issue_type);
                const history = statusHistory[ticket.jira_key] || [];
                const isExpanded = expandedRow === ticket.jira_key;

                return (
                  <>
                    <tr key={ticket.id || ticket.jira_key} className="ticket-row border-b border-gray-50">
                      {/* Tipo de incidencia */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${typeStyle.dot}`} />
                          {ticket.issue_type || "—"}
                        </span>
                      </td>

                      {/* Clave */}
                      <td className="px-4 py-3">
                        <a
                          href={`https://supervisorservicio2020.atlassian.net/browse/${ticket.jira_key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-md whitespace-nowrap hover:underline hover:text-orange-800"
                        >
                          {ticket.jira_key}
                        </a>
                      </td>

                      {/* Resumen */}
                      <td className="px-4 py-3 text-gray-800 max-w-xs">
                        <span title={ticket.summary}>{truncate(ticket.summary, 45)}</span>
                      </td>

                      {/* Subtareas — solo para Historia */}
                      <td className="px-4 py-3">
                        {isStory(ticket.issue_type) && ticket.subtask_keys?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {ticket.subtask_keys.map((sk) => (
                              <a
                                key={sk}
                                href={`https://supervisorservicio2020.atlassian.net/browse/${sk}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:underline hover:text-blue-600 hover:bg-blue-50"
                              >
                                {sk}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Principal — solo para Subtarea o Historia */}
                      <td className="px-4 py-3">
                        {(isSubtask(ticket.issue_type) || isStory(ticket.issue_type)) && ticket.parent_key ? (
                          <a
                            href={`https://supervisorservicio2020.atlassian.net/browse/${ticket.parent_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:underline hover:text-blue-800"
                          >
                            {ticket.parent_key}
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Sprint */}
                      <td className="px-4 py-3">
                        {ticket.sprint ? (
                          <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
                            {ticket.sprint}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Asignado */}
                      {showAssignee && (
                        <td className="px-4 py-3">
                          <span className="text-gray-600 text-xs">{ticket.assignee_name || "Sin asignar"}</span>
                        </td>
                      )}

                      {/* Story Points — solo para Historia */}
                      <td className="px-4 py-3 text-center">
                        {isStory(ticket.issue_type) && ticket.story_points != null ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                            {ticket.story_points}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Estado — solo para Historia */}
                      <td className="px-4 py-3">
                        {isStory(ticket.issue_type) ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                            {ticket.status}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Informador */}
                      <td className="px-4 py-3">
                        <span className="text-gray-600 text-xs">{resolveName(ticket.reporter_name)}</span>
                      </td>

                      {/* Creada */}
                      <td className="px-4 py-3">
                        <span className="text-gray-400 text-xs whitespace-nowrap" title={formatDate(ticket.created_at)}>
                          {timeAgo(ticket.created_at)}
                        </span>
                      </td>

                      {/* Historial de estados — No aplica para Subtarea ni Épica */}
                      <td className="px-4 py-3 text-center">
                        {hasStatusHistory(ticket.issue_type) && history.length > 0 ? (
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : ticket.jira_key)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${isExpanded
                              ? "bg-orange-50 text-orange-600 border border-orange-200"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {history.length}
                          </button>
                        ) : hasStatusHistory(ticket.issue_type) ? (
                          <span className="text-gray-300 text-xs">0</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded: Status History Timeline */}
                    {isExpanded && history.length > 0 && (
                      <tr key={`${ticket.jira_key}-history`} className="bg-gray-50/50">
                        <td colSpan={12} className="px-6 py-4">
                          <div className="max-w-2xl">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                              Historial de estados — {ticket.jira_key}
                            </p>
                            <div className="space-y-2">
                              {history.map((h, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs">
                                  <span className="text-gray-400 w-28 shrink-0">{formatDate(h.changed_at)}</span>
                                  <div className="flex items-center gap-2">
                                    {h.old_status ? (
                                      <>
                                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{h.old_status}</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                      </>
                                    ) : (
                                      <span className="text-gray-400 italic">Nuevo</span>
                                    )}
                                    <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">{h.new_status}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
    </div>
  );
}
