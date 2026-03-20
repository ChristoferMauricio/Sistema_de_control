"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { sortSprints } from "@/lib/utils";

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
// defaultFilterSprint semántica:
//   null  → no se pasó ningún valor, se lee desde la URL (comportamiento por defecto)
//   ""    → se pasó explícitamente vacío: sin sprint inicial, NO leer de URL
//   "xyz" → forzar ese sprint como valor inicial
export function useTicketData({ tickets = [], externalFilterType = "", defaultFilterSprint = null, localComments = {}, syncVersion = 0 }) {
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
  const [equipo,  setEquipo]    = useState([]); // equipo_desarrollo
  const [linksMap, setLinksMap] = useState({}); // source_key → [target_keys]

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
    // Solo restaurar sprint desde URL cuando el padre no forzó un valor explícito
    if (sprintParam !== null && defaultFilterSprint === null) setFilterSprint(sprintParam);
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

  // ── Fetch Nombres + jira_persons + equipo_desarrollo ─────────────────────
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
  }, [syncVersion]);

  // ── subtasksMap: derivado de los tickets cargados (parent_key) ────────────
  const subtasksMap = useMemo(() => {
    const map = {};
    tickets.forEach((t) => {
      if (t.parent_key) {
        if (!map[t.parent_key]) map[t.parent_key] = [];
        map[t.parent_key].push(t.jira_key);
      }
    });
    return map;
  }, [tickets]);

  // ── Fetch links (tabla relacional, no derivable de tickets) ────────────────
  useEffect(() => {
    async function fetchLinks() {
      const { data } = await supabase
        .from("jira_ticket_links")
        .select("source_key, target_key")
        .limit(10000);
      const lMap = {};
      for (const row of data || []) {
        if (!lMap[row.source_key]) lMap[row.source_key] = [];
        lMap[row.source_key].push(row.target_key);
      }
      setLinksMap(lMap);
    }
    fetchLinks();
  }, []);

  // nameMap: jiraDisplayName.lower → Nombres.Nombre (alias personalizado)
  const nameMap = useMemo(() => {
    const map = {};
    nombres.forEach((n) => {
      if (n.Programador) map[n.Programador.toLowerCase()] = n.Nombre;
    });
    return map;
  }, [nombres]);

  // personsMap: accountId/email → jira displayName
  const personsMap = useMemo(() => {
    const map = {};
    persons.forEach((p) => { if (p.email) map[p.email] = p.display_name; });
    return map;
  }, [persons]);

  // equipoEmailMap: correo_pgim / correo_gcorp → nombre real
  const equipoEmailMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.correo_pgim) map[m.correo_pgim.toLowerCase()] = m.nombre;
      if (m.correo_gcorp && m.correo_gcorp !== "-") map[m.correo_gcorp.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  // equipoKeyMap: nombre_clave (Jira display name) → nombre real
  const equipoKeyMap = useMemo(() => {
    const map = {};
    equipo.forEach((m) => {
      if (m.nombre_clave && m.nombre_clave !== "-") map[m.nombre_clave.toLowerCase()] = m.nombre;
    });
    return map;
  }, [equipo]);

  /**
   * Cadena de resolución de nombre:
   * 1. Email directo en equipo_desarrollo (correo_pgim / correo_gcorp)
   * 2. jira_persons → display_name → equipo_desarrollo nombre_clave
   * 3. jira_persons → display_name → Nombres (Programador)
   * 4. Fallback: display_name o email crudo
   */
  const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

  const resolveName = useCallback(
    (email) => {
      if (!email || email.trim() === "") return "—";
      // 1. Match directo por correo en equipo_desarrollo
      const byEmail = equipoEmailMap[email.toLowerCase()];
      if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
      // 2 y 3. Resolver display name via jira_persons, luego buscar en tablas
      const displayName = personsMap[email] || email;
      const resolved = equipoKeyMap[displayName.toLowerCase()]
        || nameMap[displayName.toLowerCase()]
        || displayName;
      return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
    },
    [nameMap, personsMap, equipoEmailMap, equipoKeyMap]
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

  const activeFilterCount = [
    filterType, filterSprint, filterStatus, filterAssignee, filterReporter,
    filterKey.length     >= 3 ? filterKey      : "",
    filterSummary.length >= 3 ? filterSummary  : "",
    filterPrincipal.length >= 3 ? filterPrincipal : "",
    filterEpic.length    >= 3 ? filterEpic     : "",
    filterComentario.length >= 3 ? filterComentario : "",
  ].filter(Boolean).length;

  // ── Filtrado + opciones en cascada ─────────────────────────────────────────
  // `base(exclude)` aplica todos los filtros activos excepto el indicado,
  // para que cada dropdown solo muestre valores válidos dado el resto de filtros.
  const { filtered, uniqueTypes, uniqueSprints, uniqueStatuses, uniqueAssignees, uniqueReporters } =
    useMemo(() => {
      const base = (exclude) => {
        let r = tickets;

        if (search.trim()) {
          const q = search.toLowerCase();
          r = r.filter((t) =>
            t.jira_key?.toLowerCase().includes(q) ||
            t.summary?.toLowerCase().includes(q) ||
            resolveName(t.assignee_email)?.toLowerCase().includes(q) ||
            t.status?.toLowerCase().includes(q) ||
            t.issue_type?.toLowerCase().includes(q) ||
            t.sprint?.toLowerCase().includes(q)
          );
        }

        if (exclude !== "type" && filterType)       r = r.filter((t) => t.issue_type === filterType);
        if (filterKey.length >= 3)                  r = r.filter((t) => t.jira_key?.toLowerCase().includes(filterKey.toLowerCase()));
        if (filterSummary.length >= 3)              r = r.filter((t) => t.summary?.toLowerCase().includes(filterSummary.toLowerCase()));
        if (exclude !== "sprint" && filterSprint)   r = r.filter((t) => filterSprint === "Backlog" ? !t.sprint : t.sprint === filterSprint);
        if (exclude !== "status" && filterStatus)   r = r.filter((t) => t.status === filterStatus);
        if (filterPrincipal.length >= 3)            r = r.filter((t) => t.parent_key?.toLowerCase().includes(filterPrincipal.toLowerCase()));

        if (filterEpic.length >= 3) {
          const qs = filterEpic.toLowerCase();
          r = r.filter((t) => {
            const epicObj = resolveEpic(t);
            return epicObj && epicObj.summary.toLowerCase().includes(qs);
          });
        }

        if (filterComentario.length >= 3) {
          const qc = filterComentario.toLowerCase();
          r = r.filter((t) => {
            const c = localComments[t.jira_key] !== undefined ? localComments[t.jira_key] : t.comentario;
            return c?.toLowerCase().includes(qc);
          });
        }

        if (exclude !== "assignee" && filterAssignee) r = r.filter((t) => resolveName(t.assignee_email) === filterAssignee);
        if (exclude !== "reporter" && filterReporter) r = r.filter((t) => resolveName(t.reporter_email) === filterReporter);

        return r;
      };

      // Resultado completo ordenado (para la tabla)
      const result = base(null);
      result.sort((a, b) => {
        let aVal = a[sortField] || "";
        let bVal = b[sortField] || "";
        if (sortField === "assignee_name") {
          aVal = resolveName(a.assignee_email);
          bVal = resolveName(b.assignee_email);
        } else if (sortField === "epic") {
          aVal = resolveEpic(a)?.summary ?? "";
          bVal = resolveEpic(b)?.summary ?? "";
        } else if (sortField === "comentario") {
          aVal = localComments[a.jira_key] !== undefined ? localComments[a.jira_key] : (a.comentario || "");
          bVal = localComments[b.jira_key] !== undefined ? localComments[b.jira_key] : (b.comentario || "");
        }
        if (sortDir === "asc") return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });

      // Opciones en cascada: cada dropdown excluye su propio filtro
      return {
        filtered: result,
        uniqueTypes:    [...new Set(base("type").map((t) => t.issue_type).filter(Boolean))].sort(),
        uniqueSprints:  (() => {
          const sprintBase = base("sprint");
          const named = sortSprints([...new Set(sprintBase.map((t) => t.sprint).filter(Boolean))]);
          const hasBacklog = sprintBase.some((t) => !t.sprint);
          return hasBacklog ? [...named, "Backlog"] : named;
        })(),
        uniqueStatuses: [...new Set(base("status").map((t) => t.status).filter(Boolean))].sort(),
        uniqueAssignees:[...new Set(base("assignee").map((t) => resolveName(t.assignee_email)).filter((v) => v && v !== "—"))].sort(),
        uniqueReporters:[...new Set(base("reporter").map((t) => resolveName(t.reporter_email)).filter((v) => v && v !== "—"))].sort(),
      };
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
    // Relacional
    subtasksMap, linksMap,
  };
}
