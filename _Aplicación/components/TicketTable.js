"use client";

import { useState, useMemo } from "react";
import { formatDate, timeAgo, getPriorityColor, getStatusColor, truncate, getInitials } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function TicketTable({ tickets = [], title, showAssignee = true }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDir, setSortDir] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);

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
          t.status?.toLowerCase().includes(q)
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
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
      </svg>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-foreground">
            {title || "Tickets"}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            className="pl-9 pr-4 py-2 rounded-lg bg-elevated border border-border text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all w-full sm:w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th
                onClick={() => toggleSort("jira_key")}
                className="text-left px-6 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              >
                Key <SortIcon field="jira_key" />
              </th>
              <th
                onClick={() => toggleSort("summary")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              >
                Resumen <SortIcon field="summary" />
              </th>
              <th
                onClick={() => toggleSort("status")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              >
                Estado <SortIcon field="status" />
              </th>
              <th
                onClick={() => toggleSort("priority")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              >
                Prioridad <SortIcon field="priority" />
              </th>
              {showAssignee && (
                <th
                  onClick={() => toggleSort("assignee_name")}
                  className="text-left px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none hidden md:table-cell"
                >
                  Asignado <SortIcon field="assignee_name" />
                </th>
              )}
              <th
                onClick={() => toggleSort("updated_at")}
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none hidden lg:table-cell"
              >
                Actualizado <SortIcon field="updated_at" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={showAssignee ? 6 : 5} className="px-6 py-12 text-center text-muted">
                  <div className="flex flex-col items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p>No se encontraron tickets</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((ticket) => {
                const statusColor = getStatusColor(ticket.status);
                const priorityColor = getPriorityColor(ticket.priority);
                return (
                  <tr key={ticket.id || ticket.jira_key} className="ticket-row border-b border-border/50">
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs font-semibold text-primary-light bg-primary/10 px-2 py-1 rounded-md">
                        {ticket.jira_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground max-w-xs">
                      <span title={ticket.summary}>{truncate(ticket.summary, 55)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${priorityColor.bg} ${priorityColor.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityColor.dot}`} />
                        {ticket.priority}
                      </span>
                    </td>
                    {showAssignee && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-elevated flex items-center justify-center text-[10px] font-semibold text-secondary-text">
                            {getInitials(ticket.assignee_name)}
                          </div>
                          <span className="text-secondary-text text-xs">{ticket.assignee_name || "Sin asignar"}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-muted text-xs" title={formatDate(ticket.updated_at)}>
                        {timeAgo(ticket.updated_at)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary-text hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-secondary-text hover:bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
