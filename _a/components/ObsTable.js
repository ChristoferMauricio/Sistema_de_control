"use client";

import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import MarkdownEditor from "@/components/MarkdownEditor";

// Icon helpers
const TypeIcon = ({ type }) => {
  switch (type) {
    case "Subtarea":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H6v2h2v5h2v-5h2v-2z"/>
        </svg>
      );
    case "Historia":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
        </svg>
      );
    case "Épica":
    case "Epic":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.5 4.5l-5.5 5.5-5.5-5.5L5 6l6 6-6 6 1.5 1.5 5.5-5.5 5.5 5.5 1.5-1.5-6-6 6-6z"/>
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      );
  }
};

const PriorityIcon = ({ priority }) => {
  switch (priority) {
    case "Highest":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      );
    case "High":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      );
    case "Low":
    case "Lowest":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
  }
};

export default function ObservacionesSupervisorTable({ tickets, nombresData }) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Local comments state for optimistic updates
  const [localComments, setLocalComments] = useState({});

  // Editing Comment Modal State
  const [editingComment, setEditingComment] = useState(null); // { jira_key, current_comment, summary, story_points }
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [editingError, setEditingError] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    global: "",
    epica: "",
    parent_key: "",
    sprint_name: "",
    assignee: "",
    status: "",
    comentario: "",
  });

  // Map assignees to `Nombres` data
  const nameMap = useMemo(() => {
    const m = new Map();
    nombresData.forEach((row) => {
      m.set(row.Clave, row.Nombre);
    });
    return m;
  }, [nombresData]);

  // Map tickets for hierarchy lookups (Subtask -> Story -> Epic)
  const ticketMap = useMemo(() => {
    const m = new Map();
    tickets.forEach(t => m.set(t.jira_key, t));
    return m;
  }, [tickets]);

  const resolveEpic = (ticket) => {
    if (!ticket) return "-";
    
    // Si es tipo Épica, devolvemos su propio resumen
    if (ticket.issue_type === "Épica" || ticket.issue_type === "Epic") {
      return ticket.summary;
    }
    
    // Si es Historia, tiene a su Épica en parent_key
    if (ticket.issue_type === "Historia" || ticket.issue_type === "Story") {
      const epic = ticketMap.get(ticket.parent_key);
      return epic ? epic.summary : ticket.parent_key || "-";
    }

    // Si es Subtarea, su padre es la Historia. Buscamos al abuelo (Épica).
    if (ticket.issue_type === "Subtarea" || ticket.issue_type === "Sub-task") {
      const parentStory = ticketMap.get(ticket.parent_key);
      if (parentStory && parentStory.parent_key) {
        const epic = ticketMap.get(parentStory.parent_key);
        return epic ? epic.summary : parentStory.parent_key;
      }
      return "-";
    }

    return "-";
  };
  
  const extractIteration = (summary) => {
    if (!summary) return null;
    const match = summary.match(/\(Iteraci[oó]n\s+(\d+)\)/i);
    return match ? `Iteración ${match[1]}` : null;
  };

  const resolveIteration = (ticket) => {
    if (!ticket) return "-";
    if (ticket.issue_type === "Historia" || ticket.issue_type === "Story") {
      return extractIteration(ticket.summary) || "-";
    }
    if (ticket.issue_type === "Subtarea" || ticket.issue_type === "Sub-task") {
      const parentStory = ticketMap.get(ticket.parent_key);
      if (parentStory) {
        return extractIteration(parentStory.summary) || "-";
      }
    }
    return "-";
  };

  const getAssigneeFullName = (emailOrKey) => {
    if (!emailOrKey) return "Sin asignar";
    if (nameMap.has(emailOrKey)) return nameMap.get(emailOrKey);
    return emailOrKey.split("@")[0];
  };

  // Pre-process tickets to attach Epic, Iteration and local comments
  const processedData = useMemo(() => {
    return tickets.map((t) => ({
      ...t,
      resolved_epic: resolveEpic(t),
      iteration_name: resolveIteration(t),
      assignee_full: getAssigneeFullName(t.assignee_name),
      // Use optimistic comment if it exists, otherwise use DB comment
      display_comment: localComments.hasOwnProperty(t.jira_key) ? localComments[t.jira_key] : (t.comentario || ""),
    }));
  }, [tickets, nameMap, ticketMap, localComments]);

  // Filter Logic
  const filteredData = useMemo(() => {
    return processedData.filter((row) => {
      const gMatch = filters.global
        ? String(row.jira_key).toLowerCase().includes(filters.global.toLowerCase()) ||
          String(row.summary).toLowerCase().includes(filters.global.toLowerCase())
        : true;

      const eMatch = filters.epica
        ? String(row.resolved_epic).toLowerCase().includes(filters.epica.toLowerCase())
        : true;

      const pMatch = filters.parent_key
        ? String(row.parent_key || "").toLowerCase().includes(filters.parent_key.toLowerCase())
        : true;

      const sMatch = filters.sprint_name
        ? String(row.sprint_name || "").toLowerCase().includes(filters.sprint_name.toLowerCase())
        : true;

      const asMatch = filters.assignee
        ? String(row.assignee_full).toLowerCase().includes(filters.assignee.toLowerCase())
        : true;

      const stMatch = filters.status
        ? String(row.status || "").toLowerCase().includes(filters.status.toLowerCase())
        : true;

      const cMatch = filters.comentario
        ? String(row.display_comment || "").toLowerCase().includes(filters.comentario.toLowerCase())
        : true;

      const iMatch = filters.iteration_name
        ? String(row.iteration_name || "").toLowerCase().includes(filters.iteration_name.toLowerCase())
        : true;

      return gMatch && eMatch && pMatch && sMatch && iMatch && asMatch && stMatch && cMatch;
    });
  }, [processedData, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleSaveComment = async () => {
    if (!editingComment) return;
    setIsSavingComment(true);
    setEditingError(null);

    const { jira_key, current_comment } = editingComment;

    try {
      const { error } = await supabase
        .from("jira_tickets")
        .update({ comentario: current_comment })
        .eq("jira_key", jira_key);

      if (error) throw error;

      // Optimistic Update
      setLocalComments((prev) => ({ ...prev, [jira_key]: current_comment }));
      setEditingComment(null);
    } catch (err) {
      console.error("Error updating comment:", err);
      setEditingError("Hubo un problema al guardar el comentario. Inténtalo de nuevo.");
    } finally {
      setIsSavingComment(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredData.map((row) => ({
      "Épica": row.resolved_epic,
      "Principal": row.parent_key || "-",
      "Sprint": row.sprint_name || "Sin Sprint",
      "Iteración": row.iteration_name,
      "Tipo": row.issue_type,
      "Comentario": row.display_comment,
      "Clave": row.jira_key,
      "Resumen": row.summary,
      "Asignado": row.assignee_full,
      "Estado": row.status,
      "Story Points": row.story_points || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Observaciones Supervisor");
    XLSX.writeFile(workbook, "observaciones_supervisor_jira.xlsx");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* HEADER / TOOLBAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-5 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold font-[family-name:var(--font-heading)] text-gray-800">
              Observaciones del Supervisor ({filteredData.length})
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Solo tickets con comentarios añadidos
            </p>
          </div>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar general..."
              value={filters.global}
              onChange={(e) => handleFilterChange("global", e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all bg-gray-50/50"
            />
          </div>
        </div>

        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 rounded-lg text-sm font-semibold transition-colors border border-emerald-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Exportar Excel
        </button>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-x-auto relative min-h-0 bg-white">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 sticky top-0 z-10 font-semibold tracking-wider">
            <tr>
              <th className="px-5 py-3.5 border-b border-gray-200">Épica</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Principal</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Sprint</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Iteración</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Tipo</th>
              <th className="px-5 py-3.5 border-b border-gray-200 min-w-[300px]">Comentario</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Clave</th>
              <th className="px-5 py-3.5 border-b border-gray-200 w-full">Resumen</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Asignado</th>
              <th className="px-5 py-3.5 border-b border-gray-200">Estado</th>
            </tr>
            {/* Filter Row */}
            <tr className="bg-white border-b border-gray-200">
              <th className="p-2"><input type="text" placeholder="Filtrar Épica" className="w-full text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.epica} onChange={(e) => handleFilterChange("epica", e.target.value)} /></th>
              <th className="p-2"><input type="text" placeholder="Filtrar Principal" className="w-full text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.parent_key} onChange={(e) => handleFilterChange("parent_key", e.target.value)} /></th>
              <th className="p-2"><input type="text" placeholder="Filtrar Sprint" className="w-[120px] text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.sprint_name} onChange={(e) => handleFilterChange("sprint_name", e.target.value)} /></th>
              <th className="p-2"><input type="text" placeholder="Filtrar iteración" className="w-[110px] text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.iteration_name} onChange={(e) => handleFilterChange("iteration_name", e.target.value)} /></th>
              <th className="p-2"></th>
              <th className="p-2"><input type="text" placeholder="Filtrar Comentario" className="w-full text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.comentario} onChange={(e) => handleFilterChange("comentario", e.target.value)} /></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"><input type="text" placeholder="Filtrar Asignado" className="w-[120px] text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.assignee} onChange={(e) => handleFilterChange("assignee", e.target.value)} /></th>
              <th className="p-2"><input type="text" placeholder="Filtrar Estado" className="w-full text-xs p-1.5 border border-gray-200 rounded bg-gray-50 font-normal" value={filters.status} onChange={(e) => handleFilterChange("status", e.target.value)} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-medium">
            {paginatedData.map((row) => {
              const rowKey = row.jira_key;
              const isEpic = row.issue_type === "Épica" || row.issue_type === "Epic";
              
              return (
                <tr key={rowKey} className="ticket-row group cursor-pointer border-b border-gray-200 bg-white">
                  {/* Épica */}
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${
                      row.resolved_epic === "-" 
                        ? "text-gray-400" 
                        : "bg-purple-50 text-purple-700 font-bold border border-purple-200 shadow-sm"
                    }`}>
                      {row.resolved_epic !== "-" ? row.resolved_epic.slice(0, 30) + (row.resolved_epic.length > 30 ? "..." : "") : "-"}
                    </span>
                  </td>
                  
                  {/* Principal */}
                  <td className="px-5 py-4">
                    <span className="text-gray-500 font-mono text-xs px-2 py-1 bg-gray-50 rounded-md border border-gray-200">
                      {row.parent_key || "-"}
                    </span>
                  </td>
                  
                  {/* Sprint */}
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded-md border text-gray-700 font-semibold ${
                      row.sprint_name ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
                    }`}>
                      {row.sprint_name || "Backlog"}
                    </span>
                  </td>
                  
                  {/* Iteración */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-orange-700 font-semibold bg-orange-50/50 px-2 py-1 rounded-md border border-orange-100 w-max">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-orange-500">
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                      </svg>
                      {row.iteration_name}
                    </div>
                  </td>
                  
                  {/* Tipo */}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center p-1.5 bg-gray-50 rounded-md border border-gray-200 w-max" title={row.issue_type}>
                      <TypeIcon type={row.issue_type} />
                    </div>
                  </td>

                  {/* COMENTARIO (Observación del supervisor) */}
                  <td className="px-5 py-4 whitespace-normal min-w-[300px] w-[400px] border-l border-r border-gray-100 bg-gray-50/30 group-hover:bg-gray-50 relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-gray-700 leading-relaxed font-normal prose prose-sm prose-p:my-0 prose-ul:my-0 prose-ol:my-0 w-full break-words line-clamp-3 overflow-hidden">
                        {/* We use Markdown formatting simply as text representation here or you could use ReactMarkdown */}
                        {row.display_comment}
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => setEditingComment({
                          jira_key: row.jira_key,
                          current_comment: row.display_comment,
                          summary: row.summary,
                          story_points: row.story_points,
                        })}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all shrink-0"
                        title="Editar Comentario"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  </td>

                  {/* Clave */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                       <PriorityIcon priority={row.priority} />
                       <a 
                          href={`https://supervisorservicio2020.atlassian.net/browse/${row.jira_key}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200 hover:bg-orange-600 hover:text-white transition-colors"
                        >
                          {row.jira_key}
                        </a>
                    </div>
                  </td>
                  
                  {/* Resumen */}
                  <td className="px-5 py-4 text-gray-800 whitespace-normal min-w-[250px] leading-snug">
                    <span className={isEpic ? "font-bold text-purple-700" : ""}>
                      {row.summary}
                    </span>
                  </td>
                  
                  {/* Asignado */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600 border border-gray-300">
                        {row.assignee_full !== "Sin asignar" ? row.assignee_full.slice(0, 2).toUpperCase() : "?"}
                      </div>
                      <span className="text-gray-700 text-sm">
                        {row.assignee_full}
                      </span>
                    </div>
                  </td>
                  
                  {/* Estado */}
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm ${
                      row.status === "Terminada" || row.status === "Done"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : row.status === "En curso" || row.status === "In Progress"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-gray-500 bg-gray-50/50">
                  <div className="flex flex-col items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p>No se encontraron tickets con comentarios para estos filtros.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-600 font-medium">
          Mostrando <span className="font-bold text-gray-900">{filteredData.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}</span> a <span className="font-bold text-gray-900">{Math.min(currentPage * rowsPerPage, filteredData.length)}</span> de <span className="font-bold text-gray-900">{filteredData.length}</span> resultados
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            Anterior
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            Siguiente
          </button>
        </div>
      </div>

      {/* EDIT COMMENT MODAL */}
      {editingComment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up ring-1 ring-gray-900/5">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold font-[family-name:var(--font-heading)] text-gray-900">
                  Editar Comentario
                </h3>
                <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                  {editingComment.jira_key}
                </span>
                
                {/* Story Points badge */}
                {editingComment.story_points > 0 && (
                  <span className="flex items-center text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded shadow-sm border border-amber-200" title="Story Points">
                    {editingComment.story_points}
                  </span>
                )}

                {/* Summary snippet */}
                <span className="text-sm font-medium text-gray-500 max-w-md truncate border-l border-gray-300 pl-3">
                  {editingComment.summary}
                </span>
              </div>
              <button
                onClick={() => setEditingComment(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200 rounded-lg transition-all"
                disabled={isSavingComment}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              {editingError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm mb-4">
                  {editingError}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Formato Markdown Soportado
                </label>
                
                <MarkdownEditor
                  value={editingComment.current_comment}
                  onChange={(val) => setEditingComment({ ...editingComment, current_comment: val })}
                  rows={8}
                  placeholder="Añade un comentario detallado al ticket..."
                />

                <p className="text-[11px] text-gray-500 text-right mt-1">
                  Nota: Si borras el comentario por completo, el ticket desaparecerá de esta tabla.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button
                onClick={() => setEditingComment(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 border border-transparent rounded-xl transition-all"
                disabled={isSavingComment}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveComment}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-500/20 rounded-xl transition-all"
                disabled={isSavingComment}
              >
                {isSavingComment ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Guardando...
                  </>
                ) : (
                  "Guardar Comentario"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
