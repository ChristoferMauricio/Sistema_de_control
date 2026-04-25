"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sortSprints, truncate } from "@/lib/utils";
import { Filter, Check, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function EpicsDistributionChart({ tickets = [], currentSprint = "" }) {
  const [filterSprint, setFilterSprint] = useState(currentSprint);
  const [excludedEpics, setExcludedEpics] = useState(new Set());
  const [isEpicDropdownOpen, setIsEpicDropdownOpen] = useState(false);
  const [popup, setPopup] = useState(null);
  const [portalRoot, setPortalRoot] = useState(null);
  const dropdownRef = useRef(null);

  const [nombres, setNombres]   = useState([]);
  const [persons, setPersons]   = useState([]);
  const [equipo,  setEquipo]    = useState([]);

  useEffect(() => { setPortalRoot(document.body); }, []);

  // Fetch data to resolve assignee names
  useEffect(() => {
    async function fetchPersonData() {
      const [nombresRes, personsRes, equipoRes] = await Promise.all([
        supabase.from("Nombres").select("Nombre, Programador"),
        supabase.from("jira_persons").select("email, display_name"),
        supabase.from("equipo_desarrollo").select("nombre, nombre_clave, correo_pgim, correo_gcorp"),
      ]);
      if (nombresRes.data)  setNombres(nombresRes.data);
      if (personsRes.data)  setPersons(personsRes.data);
      if (equipoRes.data)   setEquipo(equipoRes.data);
    }
    fetchPersonData();
  }, []);

  // Mapas para resolver nombres
  const nameMap = useMemo(() => {
    const map = {};
    nombres.forEach((n) => { if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre; });
    return map;
  }, [nombres]);

  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => { if (p.email) map[p.email] = p.display_name; });
    return map;
  }, [persons]);

  const equipoEmailMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.correo_pgim) map[m.correo_pgim.toLowerCase()] = m.nombre;
      if (m.correo_gcorp && m.correo_gcorp !== "-") map[m.correo_gcorp.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  const equipoKeyMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.nombre_clave && m.nombre_clave !== "-") map[m.nombre_clave.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

  const resolveName = (email) => {
    if (!email || email.trim() === "") return "Sin asignar";
    const byEmail = equipoEmailMap[email.toLowerCase()];
    if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
    const displayName = personsMap[email] || email;
    const resolved = equipoKeyMap[displayName.toLowerCase()]
      || nameMap[displayName.toLowerCase()]
      || displayName;
    return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsEpicDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sprints únicos
  const uniqueSprints = useMemo(() => {
    const sprints = [...new Set(tickets.map(t => t.sprint).filter(Boolean))];
    return sortSprints(sprints);
  }, [tickets]);

  // Si no hay sprint seleccionado, tomar el primero si uniqueSprints tiene elementos,
  // pero solo la primera vez si currentSprint falló. (Normalmente arranca con currentSprint).
  useEffect(() => {
    if (!filterSprint && uniqueSprints.length > 0) {
      setFilterSprint(uniqueSprints[0]);
    }
  }, [filterSprint, uniqueSprints]);

  // 1. Identificar Épicas del Tablero PF3
  const pf3Epics = useMemo(() => {
    return tickets.filter(t => 
      t.jira_key?.startsWith("PF3-") && 
      (t.issue_type === "Epic" || t.issue_type === "Épica")
    );
  }, [tickets]);

  // 2. Filtrar Historias del Tablero PF3 para el Sprint seleccionado y contar HUs/Puntos
  const { epicStats, activeEpicsList } = useMemo(() => {
    const map = {};
    pf3Epics.forEach(e => {
      map[e.jira_key] = {
        key: e.jira_key,
        summary: e.summary,
        hus: 0,
        sp: 0,
        tickets: []
      };
    });

    const pf3Stories = tickets.filter(t => {
      if (!t.jira_key?.startsWith("PF3-")) return false;
      const type = (t.issue_type || "").toLowerCase();
      if (!type.includes("histori") && type !== "story") return false;
      if (filterSprint && t.sprint !== filterSprint) return false;
      if (!t.parent_key || !map[t.parent_key]) return false;
      return true;
    });

    pf3Stories.forEach(t => {
      map[t.parent_key].hus += 1;
      map[t.parent_key].sp += (parseFloat(t.story_points) || 0);
      map[t.parent_key].tickets.push(t);
    });

    // Quedarse solo con las épicas que tienen al menos 1 HU en este sprint
    const active = Object.values(map)
      .filter(e => e.hus > 0)
      .sort((a, b) => a.summary.localeCompare(b.summary, "es"));

    return { epicStats: active, activeEpicsList: active };
  }, [tickets, pf3Epics, filterSprint]);

  // Resetear filtros de épicas cuando cambia el sprint
  useEffect(() => {
    setExcludedEpics(new Set());
  }, [filterSprint]);

  // 3. Aplicar exclusión de épicas
  const finalData = useMemo(() => {
    return epicStats.filter(e => !excludedEpics.has(e.key));
  }, [epicStats, excludedEpics]);

  const toggleEpic = (epicKey) => {
    setExcludedEpics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(epicKey)) {
        newSet.delete(epicKey);
      } else {
        newSet.add(epicKey);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (excludedEpics.size > 0) {
      setExcludedEpics(new Set()); // Seleccionar todas (vaciar excluidas)
    } else {
      setExcludedEpics(new Set(activeEpicsList.map(e => e.key))); // Deseleccionar todas
    }
  };

  // Calcular máximos para normalizar las barras
  const maxHUs = Math.max(...finalData.map(e => e.hus), 1);
  const maxSP = Math.max(...finalData.map(e => e.sp), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible animate-fade-in">
      {/* Header + Filtros */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Distribución de Épicas (PF3)
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {finalData.length} épica{finalData.length !== 1 ? "s" : ""} mostrada{finalData.length !== 1 ? "s" : ""} en la tabla
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Leyenda */}
          <div className="flex items-center gap-3 mr-2 text-[11px] font-medium text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 block" /> HUs
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 block" /> Story Points
            </div>
          </div>

          {/* Filtro Épicas */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsEpicDropdownOpen(!isEpicDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              Épicas ({activeEpicsList.length - excludedEpics.size}/{activeEpicsList.length})
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            
            {isEpicDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col">
                <div className="p-2 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <span className="text-xs font-semibold text-gray-600">Filtrar Épicas</span>
                  <button 
                    onClick={toggleAll}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                  >
                    {excludedEpics.size > 0 ? "Seleccionar todas" : "Deseleccionar todas"}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {activeEpicsList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-gray-400">No hay épicas en este sprint</div>
                  ) : (
                    activeEpicsList.map(epic => (
                      <div key={epic.key} onClick={() => toggleEpic(epic.key)} className="flex items-start gap-2.5 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                        <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${!excludedEpics.has(epic.key) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-300 bg-white'}`}>
                          {!excludedEpics.has(epic.key) && <Check className="w-3 h-3" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-gray-800 group-hover:text-indigo-700 line-clamp-2 leading-tight">
                            {epic.summary}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono mt-0.5">{epic.key}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Filtro Sprint */}
          <select
            value={filterSprint}
            onChange={(e) => setFilterSprint(e.target.value)}
            className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors cursor-pointer min-w-[140px]"
          >
            <option value="">Todos los sprints</option>
            {uniqueSprints.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla y Barras */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50/80 border-b border-gray-200">
            <tr>
              <th className="px-5 py-3 text-gray-600 font-semibold w-[35%]">Épica</th>
              <th className="px-3 py-3 text-gray-600 font-semibold text-center w-[10%]">HUs</th>
              <th className="px-3 py-3 text-gray-600 font-semibold text-center w-[10%]">SP</th>
              <th className="px-5 py-3 text-gray-600 font-semibold w-[45%]">Proporción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {finalData.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-gray-400 text-sm">No hay épicas activas para los filtros seleccionados.</p>
                </td>
              </tr>
            ) : (
              finalData.map((epic) => (
                <tr 
                  key={epic.key} 
                  className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                  onClick={() => setPopup({ epicName: epic.summary, tickets: epic.tickets })}
                  title="Ver detalle de las historias de usuario"
                >
                  <td className="px-5 py-3 whitespace-normal">
                    <div className="font-semibold text-gray-800 text-[13px] leading-tight">
                      {epic.summary}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono mt-1">
                      {epic.key}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center items-center h-full">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {epic.hus}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center items-center h-full">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-1 rounded-md text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200">
                        {epic.sp}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 align-middle">
                    <div className="flex flex-col gap-2 w-full py-1">
                      {/* Barra de HUs */}
                      <div className="flex items-center w-full group relative">
                        <div className="w-full bg-blue-50 rounded-r-md h-3.5 flex overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-700 ease-out flex-shrink-0"
                            style={{ width: `${(epic.hus / maxHUs) * 100}%` }}
                          />
                        </div>
                      </div>
                      
                      {/* Barra de SP */}
                      <div className="flex items-center w-full group relative">
                        <div className="w-full bg-orange-50 rounded-r-md h-3.5 flex overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-700 ease-out flex-shrink-0"
                            style={{ width: `${(epic.sp / maxSP) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Popup de detalle de Épica (portaleado a body) ── */}
      {popup && portalRoot && createPortal(
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" style={{ zIndex: 99998 }} onClick={() => setPopup(null)} />
          <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 99999, padding: "1.5rem" }} onClick={() => setPopup(null)}>
            <div
              className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl flex flex-col animate-fade-in"
              style={{ maxHeight: "calc(100vh - 3rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h4 className="text-lg font-bold font-[family-name:var(--font-heading)] text-gray-900 line-clamp-1">
                    Épica: {popup.epicName}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {popup.tickets.length} HUs involucradas
                  </p>
                </div>
                <button
                  onClick={() => setPopup(null)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 px-6 py-3">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-[11px] uppercase text-gray-400 font-semibold border-b border-gray-100 sticky top-0 bg-white z-10">
                    <tr>
                      <th className="py-2 pr-3 w-[100px]">Clave</th>
                      <th className="py-2 pr-3">Resumen</th>
                      <th className="py-2 pr-3 text-center">SP</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2">Asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popup.tickets.map((t) => (
                      <tr key={t.jira_key || t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 pr-3">
                          <a
                            href={`https://supervisorservicio2020.atlassian.net/browse/${t.jira_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                          >
                            {t.jira_key}
                          </a>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700 whitespace-normal min-w-[200px] max-w-[400px]">
                          <div className="line-clamp-2" title={t.summary}>{t.summary}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          {parseFloat(t.story_points) > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-lg text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                              {t.story_points}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-gray-500 max-w-[150px] truncate" title={t.assignee_email}>
                          {resolveName(t.assignee_email)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>,
        portalRoot
      )}
    </div>
  );
}
