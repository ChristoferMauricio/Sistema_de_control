"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const ERROR_TYPES = ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"];
const EXCLUDE_PATTERN = /prueba|revisión|revision/i;
const JIRA_BASE = "https://supervisorservicio2020.atlassian.net/browse";

/* ───────── Detail Modal ───────── */
function DetailModal({ title, personName, items, linksMap, ticketMap, onClose }) {
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
                  <div key={ticket.jira_key} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
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
                              ? "bg-rose-50 text-rose-600 border border-rose-200"
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
                        <div className="space-y-1">
                          {linkedKeys.map((lk) => {
                            const linked = ticketMap[lk.target_key];
                            return (
                              <div key={`${ticket.jira_key}-${lk.target_key}`} className="flex items-center gap-2 text-xs">
                                <span className="text-gray-400 italic shrink-0">{lk.link_type}</span>
                                <a
                                  href={`${JIRA_BASE}/${lk.target_key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono font-semibold text-indigo-600 hover:underline shrink-0"
                                >
                                  {lk.target_key}
                                </a>
                                {linked && (
                                  <span className="text-gray-500 truncate">{linked.summary}</span>
                                )}
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
      <div className="px-6 pt-4 flex items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-sky-400" />
          <span>Historias</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-400" />
          <span>Errores</span>
        </div>
        <span className="text-gray-300 ml-auto">Click en una barra para ver detalle</span>
      </div>

      <div className="px-6 py-4 space-y-4">
        {data.map((row) => (
          <div key={row.name} className="flex items-start gap-3">
            {/* Name label */}
            <div className="w-36 shrink-0 text-sm font-medium text-gray-700 pt-1 truncate" title={row.name}>
              {row.name}
            </div>

            {/* Bars */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {/* Historias bar */}
              <button
                className="w-full flex items-center gap-2 group"
                onClick={() => row.historias > 0 && onBarClick(row.name, "Historia")}
                disabled={row.historias === 0}
              >
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

              {/* Errores bar */}
              <button
                className="w-full flex items-center gap-2 group"
                onClick={() => row.errores > 0 && onBarClick(row.name, "Error")}
                disabled={row.errores === 0}
              >
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full bg-rose-400 rounded-full flex items-center transition-all duration-500 ${row.errores > 0 ? "group-hover:bg-rose-500 cursor-pointer" : ""}`}
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
            </div>

            {/* Total */}
            <div className="w-10 shrink-0 text-center pt-2">
              <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                {row.historias + row.errores}
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
  const [links, setLinks] = useState([]);
  const [equipo, setEquipo] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { title, personName, items }

  useEffect(() => {
    async function fetchData() {
      const [ticketsRes, linksRes, equipoRes, personsRes] = await Promise.all([
        supabase
          .from("jira_tickets")
          .select("jira_key, summary, issue_type, status, assignee_email, reporter_email")
          .like("jira_key", "PF3QA-%"),
        supabase
          .from("jira_ticket_links")
          .select("source_key, target_key, link_type")
          .like("source_key", "PF3QA-%"),
        supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
        supabase.from("jira_persons").select("email, display_name"),
      ]);

      setTickets(ticketsRes.data || []);
      setLinks(linksRes.data || []);
      setEquipo(equipoRes.data || []);
      setPersons(personsRes.data || []);
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

  // Ticket map for quick lookup of linked ticket summaries
  const ticketMap = useMemo(() => {
    const map = {};
    tickets.forEach((t) => { map[t.jira_key] = t; });
    return map;
  }, [tickets]);

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

  // Filter & classify tickets
  const validTickets = useMemo(() => {
    return tickets.filter((t) => !EXCLUDE_PATTERN.test(t.summary || ""));
  }, [tickets]);

  // Group by reporter
  const reporterData = useMemo(() => {
    const map = {};
    validTickets.forEach((t) => {
      const name = resolveName(t.reporter_email);
      if (!name) return;
      if (!map[name]) map[name] = { name, historias: 0, errores: 0 };
      if (ERROR_TYPES.includes(t.issue_type)) {
        map[name].errores += 1;
      } else if (t.issue_type === "Historia") {
        map[name].historias += 1;
      }
    });
    return Object.values(map)
      .filter((r) => r.historias + r.errores > 0)
      .sort((a, b) => (b.historias + b.errores) - (a.historias + a.errores));
  }, [validTickets, resolveName]);

  // Group by assignee
  const assigneeData = useMemo(() => {
    const map = {};
    validTickets.forEach((t) => {
      const name = resolveName(t.assignee_email);
      if (!name) return;
      if (!map[name]) map[name] = { name, historias: 0, errores: 0 };
      if (ERROR_TYPES.includes(t.issue_type)) {
        map[name].errores += 1;
      } else if (t.issue_type === "Historia") {
        map[name].historias += 1;
      }
    });
    return Object.values(map)
      .filter((r) => r.historias + r.errores > 0)
      .sort((a, b) => (b.historias + b.errores) - (a.historias + a.errores));
  }, [validTickets, resolveName]);

  // Max values for bar scaling
  const maxReporter = useMemo(() => Math.max(...reporterData.map((r) => Math.max(r.historias, r.errores)), 1), [reporterData]);
  const maxAssignee = useMemo(() => Math.max(...assigneeData.map((r) => Math.max(r.historias, r.errores)), 1), [assigneeData]);

  // Totals
  const totalHistorias = useMemo(() => validTickets.filter((t) => t.issue_type === "Historia").length, [validTickets]);
  const totalErrores = useMemo(() => validTickets.filter((t) => ERROR_TYPES.includes(t.issue_type)).length, [validTickets]);

  // Bar click handler: open modal with filtered tickets
  const handleBarClick = useCallback((field) => (personName, type) => {
    const isError = type === "Error";
    const items = validTickets.filter((t) => {
      const name = resolveName(t[field]);
      if (name !== personName) return false;
      if (isError) return ERROR_TYPES.includes(t.issue_type);
      return t.issue_type === "Historia";
    });
    setModal({
      title: isError ? "Errores" : "Historias",
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

      {/* Stats banner */}
      <div className="flex flex-wrap gap-3 animate-fade-in">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalHistorias}</span> historia{totalHistorias !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalErrores}</span> error{totalErrores !== 1 ? "es" : ""}
          </span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 shadow-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{validTickets.length}</span> total (excl. Prueba/Revisión)
          </span>
        </div>
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
          ticketMap={ticketMap}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
