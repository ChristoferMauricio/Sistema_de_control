"use client";

import { useState, useMemo } from "react";
import { formatDate, timeAgo, getStatusColor, getIssueTypeStyle, truncate } from "@/lib/utils";

const PAGE_SIZE = 15;

export default function TicketTable({ tickets = [], title, showAssignee = true, statusHistory = {} }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);

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

    result.sort((a, b) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [tickets, search, sortField, sortDir]);

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

  function SortIcon({ field }) {
    if (sortField !== field) return null;
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 ml-1 inline text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
      </svg>
    );
  }

  // Helper: ¿Es Historia?
  const isStory = (type) => (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";
  // Helper: ¿Es Subtarea?
  const isSubtask = (type) => (type || "").toLowerCase().includes("subtare") || (type || "").toLowerCase().includes("sub-task") || (type || "").toLowerCase() === "subtask";
  // Helper: ¿Es Épica?
  const isEpic = (type) => (type || "").toLowerCase().includes("epic") || (type || "").toLowerCase().includes("épica");
  // Helper: ¿Aplica historial de estados? (No para Subtarea ni Épica)
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
          </p>
        </div>

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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500 bg-gray-50/50">
              <th
                onClick={() => toggleSort("issue_type")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap"
              >
                Tipo <SortIcon field="issue_type" />
              </th>
              <th
                onClick={() => toggleSort("jira_key")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none"
              >
                Clave <SortIcon field="jira_key" />
              </th>
              <th
                onClick={() => toggleSort("summary")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none"
              >
                Resumen <SortIcon field="summary" />
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                Subtareas
              </th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">
                Principal
              </th>
              <th
                onClick={() => toggleSort("sprint")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap hidden md:table-cell"
              >
                Sprint <SortIcon field="sprint" />
              </th>
              {showAssignee && (
                <th
                  onClick={() => toggleSort("assignee_name")}
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none hidden md:table-cell whitespace-nowrap"
                >
                  Asignado <SortIcon field="assignee_name" />
                </th>
              )}
              <th
                onClick={() => toggleSort("story_points")}
                className="text-center px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap hidden lg:table-cell"
              >
                SP <SortIcon field="story_points" />
              </th>
              <th
                onClick={() => toggleSort("status")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none whitespace-nowrap"
              >
                Estado <SortIcon field="status" />
              </th>
              <th
                onClick={() => toggleSort("reporter_name")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none hidden lg:table-cell whitespace-nowrap"
              >
                Informador <SortIcon field="reporter_name" />
              </th>
              <th
                onClick={() => toggleSort("created_at")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900 transition-colors select-none hidden lg:table-cell whitespace-nowrap"
              >
                Creada <SortIcon field="created_at" />
              </th>
              <th className="text-center px-4 py-3 font-medium whitespace-nowrap hidden md:table-cell">
                Historial
              </th>
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
                        <span className="font-mono text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-md whitespace-nowrap">
                          {ticket.jira_key}
                        </span>
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
                              <span key={sk} className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                {sk}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Principal — solo para Subtarea o Historia */}
                      <td className="px-4 py-3">
                        {(isSubtask(ticket.issue_type) || isStory(ticket.issue_type)) && ticket.parent_key ? (
                          <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                            {ticket.parent_key}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Sprint */}
                      <td className="px-4 py-3 hidden md:table-cell">
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
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-gray-600 text-xs">{ticket.assignee_name || "Sin asignar"}</span>
                        </td>
                      )}

                      {/* Story Points — solo para Historia */}
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
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
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-600 text-xs">{ticket.reporter_name || "—"}</span>
                      </td>

                      {/* Creada */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-gray-400 text-xs" title={formatDate(ticket.created_at)}>
                          {timeAgo(ticket.created_at)}
                        </span>
                      </td>

                      {/* Historial de estados — No aplica para Subtarea ni Épica */}
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {hasStatusHistory(ticket.issue_type) && history.length > 0 ? (
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : ticket.jira_key)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                              isExpanded
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
