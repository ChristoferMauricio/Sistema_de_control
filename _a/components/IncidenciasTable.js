"use client";

import { useState, useMemo } from "react";
import { Search, Filter, AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function IncidenciasTable({ incidencias, role }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterIteracion, setFilterIteracion] = useState("Todas");

  // Derive unique iterations from the data
  const iteraciones = useMemo(() => {
    const iters = new Set(incidencias.map((inc) => inc.iteracion));
    return ["Todas", ...Array.from(iters).sort()]; // Assuming Iteración X format sorts well enough or can be customized
  }, [incidencias]);

  // Filter data
  const filteredIncidencias = useMemo(() => {
    return incidencias.filter((inc) => {
      // 1. Text Search
      const textMatch = 
        inc.clave.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.resumen.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.asignado.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Iteration Filter
      const iteracionMatch = filterIteracion === "Todas" || inc.iteracion === filterIteracion;

      return textMatch && iteracionMatch;
    });
  }, [incidencias, searchTerm, filterIteracion]);

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd MMM, yy", { locale: es });
    } catch {
      return "-";
    }
  };

  // Status badge styling
  const getStatusBadge = (status) => {
    const s = status.toLowerCase();
    if (s.includes("en curso") || s.includes("in progress")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:border-blue-900/50">En Curso</span>;
    }
    if (s.includes("done") || s.includes("listo") || s.includes("completado")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:border-emerald-900/50">Completado</span>;
    }
    if (s.includes("cancelado") || s.includes("cerrado") || s.includes("rechazado")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:border-red-900/50">Cerrado</span>;
    }
    // Default / To Do
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">{status}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            placeholder="Buscar por clave, resumen o asignado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <select
              value={filterIteracion}
              onChange={(e) => setFilterIteracion(e.target.value)}
              className="text-sm border-gray-200 dark:border-gray-700 rounded-lg py-1.5 pl-3 pr-8 bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            >
              {iteraciones.map((it) => (
                <option key={it} value={it}>{it}</option>
              ))}
            </select>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium px-2">
            {filteredIncidencias.length} incidencias
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-medium transition-colors">
              <tr>
                <th className="px-6 py-4">Clave</th>
                <th className="px-6 py-4 w-1/3">Resumen</th>
                <th className="px-6 py-4">Iteración</th>
                <th className="px-6 py-4">Asignado</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {filteredIncidencias.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
                      <p>No se encontraron incidencias con estos filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIncidencias.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <a
                        href={`https://supervisorservicio2020.atlassian.net/browse/${inc.clave}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-2 py-1 rounded-md text-xs hover:underline hover:text-orange-800 dark:hover:text-orange-400"
                      >
                        {inc.clave}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100 whitespace-normal min-w-[300px]">
                      {inc.resumen}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{inc.iteracion}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                          {inc.asignado.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {inc.asignado}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(inc.estado)}
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500 dark:text-gray-400">
                      {formatDate(inc.creado)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
