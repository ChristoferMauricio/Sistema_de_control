"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 15;

// ─── Funciones puras (sin dependencia de estado) ────────────────────────────
export const isStory = (type) =>
  (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";

export const isSubtask = (type) =>
  (type || "").toLowerCase().includes("subtare") ||
  (type || "").toLowerCase().includes("sub-task") ||
  (type || "").toLowerCase() === "subtask";

export const isEpic = (type) =>
  (type || "").toLowerCase().includes("epic") || (type || "").toLowerCase().includes("épica");

export const hasStatusHistory = (type) => !isSubtask(type) && !isEpic(type);

// ─── Hook principal ─────────────────────────────────────────────────────────
export function useTicketData({ tickets = [], externalFilterType = "", defaultFilterSprint = "", localComments = {} }) {
  const [search, setSearch]               = useState("");
  const [sortField, setSortField]         = useState("updated_at");
  const [sortDir, setSortDir]             = useState("desc");
  const [currentPage, setCurrentPage]     = useState(1);

  // Filtros de columna
  const [filterType, setFilterType]             = useState("");
  const [filterSprint, setFilterSprint]         = useState(defaultFilterSprint);
  const [filterStatus, setFilterStatus]         = useState("");
  const [filterAssignee, setFilterAssignee]     = useState("");
  const [filterReporter, setFilterReporter]     = useState("");
  const [filterKey, setFilterKey]               = useState("");
  const [filterSummary, setFilterSummary]       = useState("");
  const [filterPrincipal, setFilterPrincipal]   = useState("");
  const [filterEpic, setFilterEpic]             = useState("");
  const [filterComentario, setFilterComentario] = useState("");

  const [nombres, setNombres]   = useState([]);
  const [persons, setPersons]   = useState([]); // jira_persons: { email, display_name }
  const [subtasksMap, setSubtasksMap] = useState({}); // parent_key → [child_keys]
  const [linksMap, setLinksMap]       = useState({}); // source_key → [target_keys]

  // ── Sync con filtros externos (props) ──────────────────────────────────────
  useEffect(() => {
    if (externalFilterType !== undefined && externalFilterType !== null) {
      setFilterType(externalFilterType === "Todos" ? "" : externalFilterType);
      setCurrentPage(1);
    }
  }, [externalFilterType]);

  const hasAppliedDefaultSprint = useRef(false);
  useEffect(() => {
    if (defaultFilterSprint && !hasAppliedDefaultSprint.current) {
      setFilterSprint(defaultFilterSprint);
      hasAppliedDefaultSprint.current = true;
    }
  }, [defaultFilterSprint]);

  // ── Sincronización con URL params ──────────────────────────────────────────
  const hasReadUrl = useRef(false);
  useEffect(() => {
    if (hasReadUrl.current || typeof window === "undefined") return;
    hasReadUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const sprintParam = params.get("sprint");
    const typeParam   = params.get("tipo");
    const statusParam = params.get("estado");
    if (sprintParam !== null && !defaultFilterSprint) setFilterSprint(sprintParam);
    if (typeParam   !== null && !externalFilterType)  setFilterType(typeParam);
    if (statusParam !== null)                         setFilterStatus(statusParam);
  }, [defaultFilterSprint, externalFilterType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (filterSprint) params.set("sprint", filterSprint); else params.delete("sprint");
    if (filterType)   params.set("tipo",   filterType);   else params.delete("tipo");
    if (filterStatus) params.set("estado", filterStatus); else params.delete("estado");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, [filterSprint, filterType, filterStatus]);

  // ── Fetch Nombres + jira_persons ──────────────────────────────────────────
  useEffect(() => {
    async function fetchPersonData() {
      const [nombresRes, personsRes] = await Promise.all([
        supabase.from("Nombres").select("Nombre, Programador"),
        supabase.from("jira_persons").select("email, display_name"),
      ]);
      if (nombresRes.data)  setNombres(nombresRes.data);
      if (personsRes.data)  setPersons(personsRes.data);
    }
    fetchPersonData();
  }, []);

  // ── Fetch subtasks + links cuando cambia la lista de tickets ───────────────
  useEffect(() => {
    if (!tickets.length) return;
    const keys = tickets.map((t) => t.jira_key);
    Promise.all([
      supabase.from("jira_ticket_subtasks").select("parent_key, child_key").in("parent_key", keys),
      supabase.from("jira_ticket_links").select("source_key, target_key").in("source_key", keys),
    ]).then(([subtasksRes, linksRes]) => {
      const sMap = {};
      for (const row of subtasksRes.data || []) {
        if (!sMap[row.parent_key]) sMap[row.parent_key] = [];
        sMap[row.parent_key].push(row.child_key);
      }
      setSubtasksMap(sMap);

      const lMap = {};
      for (const row of linksRes.data || []) {
        if (!lMap[row.source_key]) lMap[row.source_key] = [];
        lMap[row.source_key].push(row.target_key);
      }
      setLinksMap(lMap);
    });
  }, [tickets]);

  // nameMap: jiraDisplayName.lower → Nombres.Nombre (alias personalizado)
  const nameMap = useMemo(() => {
    const map = {};
    nombres.forEach((n) => {
      if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre;
    });
    return map;
  }, [nombres]);

  // personsMap: email → jira displayName
  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => { if (p.email) map[p.email] = p.display_name; });
    return map;
  }, [persons]);

  /**
   * Recibe un email → devuelve nombre personalizado (Nombres) o displayName de Jira
   * Cadena: email → personsMap → nameMap → fallback email
   */
  const resolveName = useCallback(
    (email) => {
      if (!email || email.trim() === "") return "—";
      const displayName = personsMap[email] || email;
      return nameMap[displayName.toLowerCase()] || displayName;
    },
    [nameMap, personsMap]
  );

  // ── Mapa de tickets y resolución de épica ──────────────────────────────────
  const ticketMap = useMemo(() => {
    const map = {};
    tickets.forEach((t) => { map[t.jira_key] = t; });
    return map;
  }, [tickets]);

  const resolveEpic = useCallback(
    (ticket) => {
      if (isEpic(ticket.issue_type)) return { key: ticket.jira_key, summary: ticket.summary };

      if (isStory(ticket.issue_type) && ticket.parent_key) {
        const parent = ticketMap[ticket.parent_key];
        if (parent && isEpic(parent.issue_type)) return { key: parent.jira_key, summary: parent.summary };
      }

      if (isSubtask(ticket.issue_type) && ticket.parent_key) {
        const parentStory = ticketMap[ticket.parent_key];
        if (parentStory && isStory(parentStory.issue_type) && parentStory.parent_key) {
          const grandParentEpic = ticketMap[parentStory.parent_key];
          if (grandParentEpic && isEpic(grandParentEpic.issue_type))
            return { key: grandParentEpic.jira_key, summary: grandParentEpic.summary };
        }
      }

      return null;
    },
    [ticketMap]
  );

  // ── Valores únicos para dropdowns ──────────────────────────────────────────
  const uniqueTypes = useMemo(
    () => [...new Set(tickets.map((t) => t.issue_type).filter(Boolean))].sort(),
    [tickets]
  );
  const uniqueSprints = useMemo(
    () => [...new Set(tickets.map((t) => t.sprint).filter(Boolean))].sort(),
    [tickets]
  );
  const uniqueStatuses = useMemo(
    () => [...new Set(tickets.map((t) => t.status).filter(Boolean))].sort(),
    [tickets]
  );
  const uniqueAssignees = useMemo(() => {
    const resolved = tickets.map((t) => resolveName(t.assignee_email)).filter((v) => v && v !== "—");
    return [...new Set(resolved)].sort();
  }, [tickets, resolveName]);
  const uniqueReporters = useMemo(() => {
    const resolved = tickets.map((t) => resolveName(t.reporter_email)).filter((v) => v && v !== "—");
    return [...new Set(resolved)].sort();
  }, [tickets, resolveName]);

  const activeFilterCount = [
    filterType, filterSprint, filterStatus, filterAssignee, filterReporter,
    filterKey.length     >= 3 ? filterKey      : "",
    filterSummary.length >= 3 ? filterSummary  : "",
    filterPrincipal.length >= 3 ? filterPrincipal : "",
    filterEpic.length    >= 3 ? filterEpic     : "",
    filterComentario.length >= 3 ? filterComentario : "",
  ].filter(Boolean).length;

  // ── Filtrado + ordenamiento ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = tickets;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.jira_key?.toLowerCase().includes(q) ||
          t.summary?.toLowerCase().includes(q) ||
          resolveName(t.assignee_email)?.toLowerCase().includes(q) ||
          t.status?.toLowerCase().includes(q) ||
          t.issue_type?.toLowerCase().includes(q) ||
          t.sprint?.toLowerCase().includes(q)
      );
    }

    if (filterType)                   result = result.filter((t) => t.issue_type === filterType);
    if (filterKey.length >= 3)        result = result.filter((t) => t.jira_key?.toLowerCase().includes(filterKey.toLowerCase()));
    if (filterSummary.length >= 3)    result = result.filter((t) => t.summary?.toLowerCase().includes(filterSummary.toLowerCase()));
    if (filterSprint)                 result = result.filter((t) => t.sprint === filterSprint);
    if (filterStatus)                 result = result.filter((t) => t.status === filterStatus);
    if (filterPrincipal.length >= 3)  result = result.filter((t) => t.parent_key?.toLowerCase().includes(filterPrincipal.toLowerCase()));

    if (filterEpic.length >= 3) {
      const qs = filterEpic.toLowerCase();
      result = result.filter((t) => {
        const epicObj = resolveEpic(t);
        return epicObj && epicObj.summary.toLowerCase().includes(qs);
      });
    }

    if (filterComentario.length >= 3) {
      const qc = filterComentario.toLowerCase();
      result = result.filter((t) => {
        const c = localComments[t.jira_key] !== undefined ? localComments[t.jira_key] : t.comentario;
        return c?.toLowerCase().includes(qc);
      });
    }

    if (filterAssignee) result = result.filter((t) => resolveName(t.assignee_email) === filterAssignee);
    if (filterReporter) result = result.filter((t) => resolveName(t.reporter_email) === filterReporter);

    result.sort((a, b) => {
      let aVal = a[sortField] || "";
      let bVal = b[sortField] || "";

      if (sortField === "assignee_name") {
        aVal = resolveName(a.assignee_email);
        bVal = resolveName(b.assignee_email);
      } else if (sortField === "epic") {
        const epicA = resolveEpic(a);
        const epicB = resolveEpic(b);
        aVal = epicA ? epicA.summary : "";
        bVal = epicB ? epicB.summary : "";
      } else if (sortField === "comentario") {
        aVal = localComments[a.jira_key] !== undefined ? localComments[a.jira_key] : (a.comentario || "");
        bVal = localComments[b.jira_key] !== undefined ? localComments[b.jira_key] : (b.comentario || "");
      }

      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

    return result;
  }, [
    tickets, search, sortField, sortDir,
    filterType, filterKey, filterSummary, filterPrincipal, filterEpic, filterComentario,
    filterSprint, filterStatus, filterAssignee, filterReporter,
    resolveName, resolveEpic, localComments,
  ]);

  // ── Paginación ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── Acciones ───────────────────────────────────────────────────────────────
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
    setFilterType(""); setFilterKey("");       setFilterSummary("");   setFilterPrincipal("");
    setFilterEpic(""); setFilterSprint("");    setFilterStatus("");    setFilterAssignee("");
    setFilterReporter(""); setFilterComentario(""); setSearch("");     setCurrentPage(1);
  }

  // Setters que también resetean la página
  const pg = (setter) => (v) => { setter(v); setCurrentPage(1); };

  return {
    // Búsqueda global
    search, setSearch: pg(setSearch),
    // Filtros
    filterType,       setFilterType:       pg(setFilterType),
    filterSprint,     setFilterSprint:     pg(setFilterSprint),
    filterStatus,     setFilterStatus:     pg(setFilterStatus),
    filterAssignee,   setFilterAssignee:   pg(setFilterAssignee),
    filterReporter,   setFilterReporter:   pg(setFilterReporter),
    filterKey,        setFilterKey:        pg(setFilterKey),
    filterSummary,    setFilterSummary:    pg(setFilterSummary),
    filterPrincipal,  setFilterPrincipal:  pg(setFilterPrincipal),
    filterEpic,       setFilterEpic:       pg(setFilterEpic),
    filterComentario, setFilterComentario: pg(setFilterComentario),
    // Ordenamiento
    sortField, sortDir, toggleSort,
    // Paginación
    currentPage, setCurrentPage, totalPages, paginated,
    // Datos
    filtered, activeFilterCount, clearAllFilters,
    // Helpers
    resolveName, resolveEpic,
    // Opciones para dropdowns
    uniqueTypes, uniqueSprints, uniqueStatuses, uniqueAssignees, uniqueReporters,
    // Datos relacionales
    subtasksMap, linksMap,
  };
}
