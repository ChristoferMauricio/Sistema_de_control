"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { sortSprints } from "@/lib/utils";

const ERROR_TYPES = ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"];
const EXCLUDE_PATTERN = /prueba|revisión|revision/i;
const JIRA_BASE = "https://supervisorservicio2020.atlassian.net/browse";

// Status classification
const STATUS_DEFS = [
  { key: "por_hacer", label: "Por hacer", match: ["tareas por hacer", "por hacer"], color: "bg-gray-200 text-gray-700" },
  { key: "en_curso", label: "En curso", match: ["en curso", "in progress", "en progreso"], color: "bg-blue-100 text-blue-700" },
  { key: "listo_dev", label: "Listo para dev", match: ["listo para dev"], color: "bg-cyan-100 text-cyan-700" },
  { key: "qa", label: "QA", match: ["control de calidad", "qa en dev"], color: "bg-amber-100 text-amber-700" },
  { key: "finalizada", label: "Finalizada", match: ["finalizada", "listo (pase a cert)", "terminada", "done", "cerrado", "resuelto", "cerrada"], color: "bg-green-100 text-green-700" },
];

function classifyStatus(status) {
  const s = (status || "").toLowerCase();
  for (const def of STATUS_DEFS) {
    if (def.match.some((m) => s.includes(m))) return def.key;
  }
  return "por_hacer"; // default
}

/* ───────── Detail Modal ───────── */
function DetailModal({ title, personName, items, linksMap, allTicketMap, onClose }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {personName} · {items.length} ticket{items.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
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
                        <div className="text-sm text-gray-800 leading-snug">{ticket.summary}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            isError
                              ? "bg-red-50 text-red-600 border border-red-200"
                              : "bg-sky-50 text-sky-600 border border-sky-200"
                          }`}>
                            {ticket.issue_type}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                            isCompleted
                              ? "bg-green-50 text-green-600 border border-green-200"
                              : "bg-amber-50 text-amber-600 border border-amber-200"
                          }`}>
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Linked activities */}
                    {linkedKeys.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
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
                                    className="font-mono font-semibold text-indigo-600 hover:underline"
                                  >
                                    {lk.target_key}
                                  </a>
                                  {linked && (
                                    <span className="ml-1.5 text-indigo-500/80">{linked.summary}</span>
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

/* ───────── Bar Chart ───────── */
function BarChart({ title, subtitle, data, maxValue, onBarClick }) {
  if (!data.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="px-6 py-12 text-center text-gray-400">Sin datos disponibles</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>

      {/* Legend */}
      <div className="px-6 pt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>Historias</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Errores</span>
        </div>
        {data.some((r) => r.excluidos > 0) && (
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M21 21l-4.879-4.879" />
            </svg>
            <span>Excluidos</span>
          </div>
        )}
        <span className="border-l border-gray-200 pl-4 flex items-center gap-2 flex-wrap">
          {STATUS_DEFS.map((sd) => (
            <span key={sd.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${sd.color}`}>
              {sd.label}
            </span>
          ))}
        </span>
        <span className="text-gray-300 ml-auto">Click en una barra para ver detalle</span>
      </div>

      <div className="px-6 py-4 space-y-5">
        {data.map((row) => (
          <div key={row.name} className="flex items-start gap-3">
            {/* Name label */}
            <div className="w-36 shrink-0 text-sm font-medium text-gray-700 pt-1 truncate" title={row.name}>
              {row.name}
            </div>

            {/* Bars */}
            <div className="flex-1 space-y-1 min-w-0">
              {/* Historias bar + status pills */}
              <button
                className="w-full flex items-center gap-2 group"
                onClick={() => row.historias > 0 && onBarClick(row.name, "Historia")}
                disabled={row.historias === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full bg-sky-400 rounded-full flex items-center transition-all duration-500 ${row.historias > 0 ? "group-hover:bg-sky-500 cursor-pointer" : ""}`}
                    style={{ width: maxValue > 0 ? `${Math.max((row.historias / maxValue) * 100, row.historias > 0 ? 4 : 0)}%` : "0%" }}
                  >
                    {row.historias > 0 && (
                      <span className="ml-auto mr-2 text-[11px] font-bold text-white drop-shadow-sm">
                        {row.historias}
                      </span>
                    )}
                  </div>
                </div>
                {row.historias === 0 && <span className="text-xs text-gray-300 w-4">0</span>}
              </button>
              {row.historias > 0 && (
                <div className="flex items-center gap-1 pl-6 flex-wrap">
                  {STATUS_DEFS.map((sd) => {
                    const count = row.historiasStatus[sd.key];
                    return count > 0 ? (
                      <span key={sd.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${sd.color}`}>
                        {sd.label}: {count}
                      </span>
                    ) : null;
                  })}
                </div>
              )}

              {/* Errores bar + status pills */}
              <button
                className="w-full flex items-center gap-2 group mt-1"
                onClick={() => row.errores > 0 && onBarClick(row.name, "Error")}
                disabled={row.errores === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full bg-red-400/80 rounded-full flex items-center transition-all duration-500 ${row.errores > 0 ? "group-hover:bg-red-500/80 cursor-pointer" : ""}`}
                    style={{ width: maxValue > 0 ? `${Math.max((row.errores / maxValue) * 100, row.errores > 0 ? 4 : 0)}%` : "0%" }}
                  >
                    {row.errores > 0 && (
                      <span className="ml-auto mr-2 text-[11px] font-bold text-white drop-shadow-sm">
                        {row.errores}
                      </span>
                    )}
                  </div>
                </div>
                {row.errores === 0 && <span className="text-xs text-gray-300 w-4">0</span>}
              </button>
              {row.errores > 0 && (
                <div className="flex items-center gap-1 pl-6 flex-wrap">
                  {STATUS_DEFS.map((sd) => {
                    const count = row.erroresStatus[sd.key];
                    return count > 0 ? (
                      <span key={sd.key} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${sd.color}`}>
                        {sd.label}: {count}
                      </span>
                    ) : null;
                  })}
                </div>
              )}

              {/* Excluidos bar */}
              {row.excluidos > 0 && (
                <>
                  <button
                    className="w-full flex items-center gap-2 group mt-1"
                    onClick={() => onBarClick(row.name, "Excluido")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M21 21l-4.879-4.879" />
                    </svg>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-amber-300/80 rounded-full flex items-center transition-all duration-500 group-hover:bg-amber-400/80 cursor-pointer"
                        style={{ width: maxValue > 0 ? `${Math.max((row.excluidos / maxValue) * 100, 4)}%` : "0%" }}
                      >
                        <span className="ml-auto mr-2 text-[11px] font-bold text-amber-800 drop-shadow-sm">
                          {row.excluidos}
                        </span>
                      </div>
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Total */}
            <div className="w-10 shrink-0 text-center pt-2">
              <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                {row.historias + row.errores + row.excluidos}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Main Page ───────── */
export default function ErroresEstadisticasPage() {
  const [tickets, setTickets] = useState([]);
  const [linkedTickets, setLinkedTickets] = useState([]);
  const [links, setLinks] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSprint, setSelectedSprint] = useState(null); // null = not initialized yet
  const [activeFilters, setActiveFilters] = useState(new Set(["Historia", "Error"])); // default: both active
  const [modal, setModal] = useState(null); // { title, personName, items }

  useEffect(() => {
    async function fetchData() {
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

      // Fetch summaries for linked tickets (PF3-XXXX) not in PF3QA
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

  // Links map: source_key → [{target_key, link_type}]
  const linksMap = useMemo(() => {
    const map = {};
    links.forEach((l) => {
      if (!map[l.source_key]) map[l.source_key] = [];
      map[l.source_key].push({ target_key: l.target_key, link_type: l.link_type });
    });
    return map;
  }, [links]);

  // Ticket map for quick lookup (PF3QA + linked PF3 tickets)
  const allTicketMap = useMemo(() => {
    const map = {};
    tickets.forEach((t) => { map[t.jira_key] = t; });
    linkedTickets.forEach((t) => { if (!map[t.jira_key]) map[t.jira_key] = t; });
    return map;
  }, [tickets, linkedTickets]);

  // Name resolution maps
  const equipoEmailMap = useMemo(() => {
    const map = {};
    equipo.forEach((e) => {
      if (e.correo_pgim) map[e.correo_pgim.toLowerCase()] = e.nombre;
      if (e.correo_gcorp) map[e.correo_gcorp.toLowerCase()] = e.nombre;
    });
    return map;
  }, [equipo]);

  const equipoKeyMap = useMemo(() => {
    const map = {};
    equipo.forEach((e) => {
      if (e.nombre_clave) map[e.nombre_clave.toLowerCase()] = e.nombre;
    });
    return map;
  }, [equipo]);

  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => {
      if (p.email && p.display_name) map[p.email.toLowerCase()] = p.display_name;
    });
    return map;
  }, [persons]);

  const resolveName = useCallback((email) => {
    if (!email || email.trim() === "") return null;
    const key = email.toLowerCase();
    const byEmail = equipoEmailMap[key];
    if (byEmail) return byEmail;
    const displayName = personsMap[key] || email;
    return equipoKeyMap[displayName.toLowerCase()] || displayName;
  }, [equipoEmailMap, equipoKeyMap, personsMap]);

  // Sprints disponibles
  const sprints = useMemo(() => {
    const s = new Set();
    tickets.forEach((t) => { if (t.sprint) s.add(t.sprint); });
    return sortSprints([...s]);
  }, [tickets]);

  // Default sprint: highest (first in sorted list)
  useEffect(() => {
    if (selectedSprint === null && sprints.length > 0) {
      setSelectedSprint(sprints[0]);
    }
  }, [sprints, selectedSprint]);

  // Filter & classify tickets
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

  // Helper: create empty status map
  const emptyStatusMap = () => {
    const m = {};
    STATUS_DEFS.forEach((d) => { m[d.key] = 0; });
    return m;
  };

  // Classify ticket category
  const classifyTicket = useCallback((t) => {
    if (EXCLUDE_PATTERN.test(t.summary || "")) return "excluido";
    if (ERROR_TYPES.includes(t.issue_type)) return "error";
    if (t.issue_type === "Historia") return "historia";
    return null;
  }, []);

  // Group by reporter
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

  // Group by assignee
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

  // Max values for bar scaling
  const maxReporter = useMemo(() => Math.max(...reporterData.map((r) => Math.max(r.historias, r.errores, r.excluidos)), 1), [reporterData]);
  const maxAssignee = useMemo(() => Math.max(...assigneeData.map((r) => Math.max(r.historias, r.errores, r.excluidos)), 1), [assigneeData]);

  // Sprint-filtered tickets (no type filter) for badge counts
  const sprintTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (selectedSprint && t.sprint !== selectedSprint) return false;
      return true;
    });
  }, [tickets, selectedSprint]);

  // Totals (always show full counts regardless of type filter)
  const totalHistorias = useMemo(() => sprintTickets.filter((t) => !EXCLUDE_PATTERN.test(t.summary || "") && t.issue_type === "Historia").length, [sprintTickets]);
  const totalErrores = useMemo(() => sprintTickets.filter((t) => !EXCLUDE_PATTERN.test(t.summary || "") && ERROR_TYPES.includes(t.issue_type)).length, [sprintTickets]);
  const totalExcluidos = useMemo(() => sprintTickets.filter((t) => EXCLUDE_PATTERN.test(t.summary || "")).length, [sprintTickets]);

  // Bar click handler: open modal with filtered tickets
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
          <div className="p-2 rounded-xl bg-indigo-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Estadísticas de Errores
          </h1>
        </div>
        <p className="text-gray-500 mt-2">
          Distribución de historias y errores por integrante del tablero PF3QA
        </p>
      </div>

      {/* Sprint filter */}
      <div className="animate-fade-in">
        <select
          value={selectedSprint || ""}
          onChange={(e) => setSelectedSprint(e.target.value)}
          className="px-4 py-2.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-sm text-indigo-700 font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
        >
          <option value="">Todos los sprints</option>
          {sprints.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
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
              ? "bg-sky-50 border-sky-400 ring-2 ring-sky-200"
              : "bg-white border-gray-200 hover:border-sky-300 hover:bg-sky-50/50 opacity-60"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalHistorias}</span> historia{totalHistorias !== 1 ? "s" : ""}
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
              ? "bg-red-50 border-red-400 ring-2 ring-red-200"
              : "bg-white border-gray-200 hover:border-red-300 hover:bg-red-50/50 opacity-60"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalErrores}</span> error{totalErrores !== 1 ? "es" : ""}
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
              ? "bg-amber-50 border-amber-400 ring-2 ring-amber-200"
              : "bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 opacity-60"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalExcluidos}</span> excluido{totalExcluidos !== 1 ? "s" : ""} (Prueba/Revisión)
          </span>
        </button>
      </div>

      {/* Chart 1: Reporters */}
      <BarChart
        title="Tickets creados por Informador"
        subtitle={`${reporterData.length} informador${reporterData.length !== 1 ? "es" : ""}`}
        data={reporterData}
        maxValue={maxReporter}
        onBarClick={handleBarClick("reporter_email")}
      />

      {/* Chart 2: Assignees */}
      <BarChart
        title="Tickets asignados por Integrante"
        subtitle={`${assigneeData.length} integrante${assigneeData.length !== 1 ? "s" : ""}`}
        data={assigneeData}
        maxValue={maxAssignee}
        onBarClick={handleBarClick("assignee_email")}
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
