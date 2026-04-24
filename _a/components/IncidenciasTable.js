/**
 * @file IncidenciasTable.js
 * @description Tabla de incidencias del proyecto Jira con filtrado por iteracion, busqueda
 *   de texto, y modal de perfil GSM del reportante. Las incidencias son issues tipo "Incidencia"
 *   extraidos de Jira con campos como clave, resumen, iteracion, asignado, estado y fecha.
 *
 *   Funcionalidades:
 *   - Busqueda global por clave, resumen o asignado
 *   - Filtro por iteracion (se auto-selecciona la iteracion actual del cronograma)
 *   - Extraccion del nombre del reportante desde el campo "description" mediante regex
 *   - Modal de perfil GSM al hacer clic en el nombre del reportante
 */
"use client";

import { useState, useMemo } from "react";
import { Search, Filter, AlertCircle, Calendar, Info } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getCurrentSprint } from "@/lib/cronogramaData";

/**
 * Tabla de incidencias con busqueda, filtro por iteracion y modal de perfil GSM.
 * @param {Object}  props
 * @param {Array}   props.incidencias - Arreglo de incidencias con campos: id, clave, resumen, iteracion, asignado, estado, creado, description
 * @param {string}  props.role        - Rol del usuario actual (admin, developer, qa, viewer)
 * @param {Array}   [props.gsmData=[]] - Datos de GSM (Gestion de Servicios) para buscar perfiles de reportantes
 */
export default function IncidenciasTable({ incidencias, role, gsmData = [] }) {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Inicializa el filtro de iteracion con la iteracion actual del cronograma,
  // convirtiendo el formato "Iteracion F3.06" -> "Iteracion 6"
  const [filterIteracion, setFilterIteracion] = useState(() => {
    const currentIter = getCurrentSprint(new Date())?.iteracion;
    if (currentIter) {
      const match = currentIter.match(/F3\.0?(\d+)/);
      if (match) return `Iteración ${match[1]}`;
    }
    return "Todas";
  });
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [localFechas, setLocalFechas] = useState({});

  const handleDateChange = (incId, field, value) => {
    setLocalFechas(prev => ({
      ...prev,
      [incId]: {
        ...(prev[incId] || {}),
        [field]: value
      }
    }));
  };

  const handleDateBlur = async (jira_key, field, value) => {
    try {
      const payload = { jira_key, [field]: value };
      const res = await fetch("/api/save-fechas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error guardando fecha");
    } catch(e) {
      console.error(e);
    }
  };

  // Extrae iteraciones unicas de los datos, ordenadas descendentemente (mas reciente primero)
  const iteraciones = useMemo(() => {
    const iters = [...new Set(incidencias.map((inc) => inc.iteracion))].sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[1]) || 0;
      const numB = parseInt(b.match(/(\d+)/)?.[1]) || 0;
      return numB - numA; // Descendente: más reciente primero
    });
    return ["Todas", ...iters];
  }, [incidencias]);

  // ─── Filtrado ───────────────────────────────────────────────────────────────
  // Aplica filtro de texto (clave, resumen, asignado) y filtro de iteracion
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

  const getStatusBadge = (status) => {
    if (!status) return null;
    const s = status.toLowerCase();
    
    if (s.includes("en curso") || s.includes("in progress") || s.includes("en progreso")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:border-blue-900/50">{status}</span>;
    }
    if (s.includes("done") || s.includes("listo (pase a cert)") || s.includes("completado") || s.includes("finalizada") || s.includes("terminada")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:border-emerald-900/50">{status}</span>;
    }
    if (s.includes("cancelado") || s.includes("cerrado") || s.includes("rechazado")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:border-red-900/50">{status}</span>;
    }
    if (s.includes("listo para dev")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200 dark:border-cyan-900/50">{status}</span>;
    }
    if (s.includes("control de calidad") || s.includes("qa") || s.includes("prueba")) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:border-amber-900/50">{status}</span>;
    }
    // Default / To Do
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">{status}</span>;
  };

  const isClosed = (status) => {
    if (!status) return false;
    const s = status.toLowerCase();
    return s.includes("done") || s.includes("listo") || s.includes("completado") || s.includes("cancelado") || s.includes("cerrado") || s.includes("rechazado");
  };

  /**
   * Extrae el nombre del reportante desde el campo "description" del ticket Jira.
   * Busca patrones como "Usuario reportante: Nombre" o "Usuario solicitante: Nombre"
   * usando expresiones regulares que toleran formato Markdown (asteriscos, etc.).
   * @param {string} description - Campo description del ticket Jira
   * @returns {string|null} Nombre del reportante o null si no se encuentra
   */
  const parseReporter = (description) => {
    if (!description) return null;
    
    // Primero buscar reportante (sin importar asteriscos o formato Markdown)
    let match = description.match(/Usuario reportante:\s*([^\n\r\*]+)/i) || 
                description.match(/Usuario\s*reportante:\s*([^\n\r\*]+)/i) ||
                description.match(/Reportante:\s*([^\n\r\*]+)/i);
                
    if (match && match[1]) {
      return match[1].trim();
    }
    
    // Luego buscar solicitante si no hay reportante
    let solicitanteMatch = description.match(/Usuario solicitante:\s*([^\n\r\*]+)/i) || 
                           description.match(/Usuario\s*solicitante:\s*([^\n\r\*]+)/i) ||
                           description.match(/Solicitante:\s*([^\n\r\*]+)/i);
                           
    if (solicitanteMatch && solicitanteMatch[1]) {
      return solicitanteMatch[1].trim();
    }
    
    return null;
  };

  /**
   * Busca el perfil GSM del reportante por nombre (coincidencia exacta o parcial).
   * Si no lo encuentra, muestra un estado de error en el modal.
   * @param {string} name - Nombre del reportante extraido de la descripcion
   */
  const handleProfileClick = (name) => {
    if (!name) return;
    const lowerName = name.toLowerCase();
    
    // Exact or partial match inside the GSM array
    const profile = gsmData.find(g => 
      g.nombre.toLowerCase() === lowerName || 
      g.nombre.toLowerCase().includes(lowerName) ||
      lowerName.includes(g.nombre.toLowerCase())
    );

    if (profile) {
      setSelectedProfile(profile);
    } else {
      setSelectedProfile({ error: true, searchedName: name });
    }
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
                <th className="px-3 py-3">Clave</th>
                <th className="px-3 py-3 w-1/4">Resumen</th>
                <th className="px-3 py-3">Reportante</th>
                <th className="px-3 py-3">Iteración</th>
                <th className="px-3 py-3">Asignado</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3 text-right">Fecha Inicio</th>
                <th className="px-3 py-3 text-right">Fecha Solución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {filteredIncidencias.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
                      <p>No se encontraron incidencias con estos filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIncidencias.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://supervisorservicio2020.atlassian.net/browse/${inc.clave}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-2 py-1 rounded-md text-xs hover:underline hover:text-orange-800 dark:hover:text-orange-400"
                        >
                          {inc.clave}
                        </a>
                        <div className="group relative flex items-center">
                          <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                          <div className="absolute left-6 -top-2 bg-gray-900 dark:bg-gray-800 text-gray-100 text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-gray-700">
                            F. Creación: {formatDate(inc.creado)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-900 dark:text-gray-100 whitespace-normal min-w-[250px] max-w-[300px]">
                      <div className="line-clamp-3" title={inc.resumen}>
                        {inc.resumen}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        if (!inc.description) {
                          return <span className="text-gray-300 dark:text-gray-600 font-bold" title="Sin descripción en BD">—</span>;
                        }
                        const reporter = parseReporter(inc.description);
                        if (reporter) {
                          return (
                            <button
                              onClick={() => handleProfileClick(reporter)}
                              className="text-left text-sm text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-800 dark:hover:text-blue-300 hover:underline focus:outline-none transition-colors truncate max-w-[120px]"
                              title={`Ver información GSM: ${reporter}`}
                            >
                              {reporter}
                            </button>
                          );
                        }
                        return <span className="text-gray-400 dark:text-gray-500 text-xs italic" title="Descripción encontrada pero sin nombre válido">—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{inc.iteracion}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                          {inc.asignado.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[120px]" title={inc.asignado}>
                          {inc.asignado}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {getStatusBadge(inc.estado)}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {(() => {
                        const val = localFechas[inc.id]?.fecha_inicio !== undefined ? localFechas[inc.id].fecha_inicio : (inc.fecha_inicio || "");
                        return (
                          <input
                            type="date"
                            className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors cursor-pointer w-[115px] ${
                              !val
                                ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 hover:bg-red-100"
                                : "bg-transparent border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            }`}
                            value={val}
                            onChange={(e) => handleDateChange(inc.id, "fecha_inicio", e.target.value)}
                            onBlur={(e) => handleDateBlur(inc.clave, "fecha_inicio", e.target.value)}
                          />
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {(() => {
                        const val = localFechas[inc.id]?.fecha_solucion !== undefined ? localFechas[inc.id].fecha_solucion : (inc.fecha_solucion || "");
                        return (
                          <input
                            type="date"
                            className={`border rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors cursor-pointer w-[115px] ${
                              !val
                                ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 hover:bg-red-100"
                                : "bg-transparent border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            }`}
                            value={val}
                            onChange={(e) => handleDateChange(inc.id, "fecha_solucion", e.target.value)}
                            onBlur={(e) => handleDateBlur(inc.clave, "fecha_solucion", e.target.value)}
                          />
                        );
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Profile Popup */}
      {selectedProfile && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-gray-900/40 z-40 transition-opacity flex justify-center items-start pt-[15vh] overflow-y-auto pb-10 px-4"
            onClick={() => setSelectedProfile(null)}
          >
            {/* Modal Content */}
            <div 
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up relative my-auto sm:my-0"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedProfile.error ? (
                <div className="p-6 text-center">
                  <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Usuario no encontrado</h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    No pudimos encontrar el perfil GSM para: <br/>
                    <strong className="text-gray-700 dark:text-gray-300 mt-2 block">"{selectedProfile.searchedName}"</strong>
                  </p>
                  <button 
                    onClick={() => setSelectedProfile(null)}
                    className="mt-6 w-full py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  <div className="h-24 bg-gradient-to-r from-cyan-500 to-blue-500 relative">
                    <button 
                      onClick={() => setSelectedProfile(null)}
                      className="absolute top-3 right-3 text-white/80 hover:text-white bg-black/10 hover:bg-black/20 p-1.5 rounded-full transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 relative">
                    {/* Avatar Circle */}
                    <div className="absolute -top-12 left-6 w-20 h-20 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center shadow-sm">
                      <div className="w-16 h-16 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 rounded-full flex items-center justify-center text-2xl font-bold">
                        {selectedProfile.nombre.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    
                    <div className="pt-10">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {selectedProfile.nombre}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-mono px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                          {selectedProfile.modalidad}
                        </span>
                        <span className="text-sm font-medium text-cyan-600 dark:text-cyan-400">
                          {selectedProfile.cargo}
                        </span>
                      </div>

                      <div className="mt-6 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Correo Electrónico</p>
                            <a href={`mailto:${selectedProfile.correo}`} className="text-sm text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                              {selectedProfile.correo}
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
