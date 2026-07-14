/**
 * @file dashboard/page.js - Página principal del dashboard (Vista General)
 * @description Página de inicio del dashboard que muestra un resumen completo del proyecto:
 *              - Widget del sprint actual con días restantes para el entregable
 *              - Tarjetas KPI: total de tickets, pendientes, errores de certificación/desarrollo
 *              - Tabla completa de todos los tickets sincronizados desde Jira
 *              - Botón de sincronización manual con la API de Jira
 *              - Historial de cambios de estado de los tickets
 *
 *              Los tickets se obtienen de Supabase con paginación (1000 por página)
 *              y se clasifican en: historias, subtareas, épicas, errores de certificación
 *              y errores de desarrollo según los vínculos en jira_ticket_links.
 *
 * @route /dashboard
 * @requires supabase - Cliente de Supabase para consultar tickets, links e historial
 * @requires TicketTable - Componente de tabla de tickets con filtros y búsqueda
 * @requires Card - Componente de tarjeta UI para las KPIs
 * @requires getCurrentSprint - Función que determina el sprint actual según la fecha
 * @requires useRole - Hook del contexto de rol del usuario
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";
import JqlSearchBar from "@/components/JqlSearchBar";
import Card from "@/components/ui/Card";
import { getCurrentSprint, formatCronogramaDate } from "@/lib/cronogramaData";
import { useRole } from "@/app/dashboard/RoleContext";
import { fetchAndClassify } from "@/lib/clasificarErrores";

/**
 * Componente principal del dashboard - Vista General.
 * Gestiona la carga de datos, sincronización con Jira, cálculo de KPIs
 * y renderizado del widget de sprint, tarjetas y tabla de tickets.
 *
 * @returns {JSX.Element} Dashboard completo con KPIs, sprint widget y tabla de tickets
 */
export default function DashboardPage() {
  /* ─── Estados de datos ─── */
  const [tickets, setTickets] = useState([]);           // Todos los tickets de Jira
  const [statusHistory, setStatusHistory] = useState({}); // Historial de cambios de estado por ticket
  const [loading, setLoading] = useState(true);          // Carga inicial de datos
  const [syncing, setSyncing] = useState(false);         // Sincronización con Jira en curso
  const [syncResult, setSyncResult] = useState(null);    // Resultado de la última sincronización
  const [syncVersion, setSyncVersion] = useState(0);     // Contador para forzar refresco en TicketTable
  const router = useRouter();
  const role = useRole();
  const [userEmail, setUserEmail] = useState("");        // Email del usuario autenticado
  const [externalFilter, setExternalFilter] = useState(""); // Filtro externo por tipo de ticket (Historia, Subtarea, Epic)
  const [jqlActive, setJqlActive]         = useState(false); // JQL está activo → bloquear filtros de columna
  const [jqlResults, setJqlResults]       = useState(null);  // Tickets filtrados por JQL (null = sin JQL)
  /* ─── Datos auxiliares para JQL (nombres y personas) ─── */
  const [jqlNombres, setJqlNombres] = useState([]);
  const [jqlPersons, setJqlPersons] = useState([]);
  const [jqlEquipo,  setJqlEquipo]  = useState([]);

  /** Estadísticas KPI calculadas a partir de los tickets */
  const [stats, setStats] = useState({
    total: 0,
    historias: 0,
    subtareas: 0,
    epicas: 0,
    pendientes: 0,
    certificacion: { porHacer: 0, enCurso: 0, qaDev: 0, qaCert: 0, finalizada: 0 },
    desarrollo: { porHacer: 0, enCurso: 0, qaDev: 0, qaCert: 0, finalizada: 0 },
  });

  /* ─── Estado del widget de Sprint actual ─── */
  const [currentSprint, setCurrentSprint] = useState(null);  // Datos del sprint en curso
  const [daysLeft, setDaysLeft] = useState(null);             // Días restantes para el entregable

  /* ─── Cálculo del sprint actual y días restantes ─── */
  useEffect(() => {
    // Determinar qué sprint está activo según la fecha de hoy
    const todayObject = new Date();
    const cSprint = getCurrentSprint(todayObject);
    setCurrentSprint(cSprint);

    if (cSprint && cSprint.fechaMaxima) {
        // Calcular días restantes hasta la fecha máxima de entrega del sprint
        const [y, m, d] = cSprint.fechaMaxima.split("-").map(Number);
        // Usar el final del día (23:59:59) de la fecha máxima para el cálculo
        const maximaDate = new Date(y, m - 1, d, 23, 59, 59, 999);

        // Diferencia en milisegundos → convertir a días redondeando hacia arriba
        const diffMs = maximaDate - todayObject;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        setDaysLeft(diffDays);
    } else {
        setDaysLeft(null);
    }
  }, []);

  /**
   * Función principal de carga de datos del dashboard.
   * Obtiene todos los tickets de Jira (paginado), calcula estadísticas KPI,
   * clasifica errores de certificación/desarrollo, y carga el historial de estados.
   *
   * Se usa useCallback para evitar recrear la función en cada render.
   */
  const fetchData = useCallback(async () => {
    // Obtener sesión para identificar al usuario (necesario para "mis pendientes")
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email || "";
    setUserEmail(email);

    /* ─── Paginación: Supabase limita a 1000 filas por query ─── */
    let allData = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, created_sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, synced_at, comentario, priority, labels")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error || !data) {
        hasMore = false;
        break;
      }

      allData = [...allData, ...data];
      from += pageSize;
      // Si recibimos exactamente pageSize registros, puede haber más
      hasMore = data.length === pageSize;
    }

    if (allData.length > 0) {
      setTickets(allData);

      /* ─── Clasificación de errores usando fetchAndClassify (misma lógica que pestañas) ─── */
      const classifyResult = await fetchAndClassify();
      const currentQASprint = classifyResult.defaultSprint;
      const certBugs = classifyResult.certificacion.filter(t => t.sprint === currentQASprint);
      const desBugs = classifyResult.desarrollo.filter(t => t.sprint === currentQASprint);

      /**
       * Cuenta tickets por estado (Por hacer, En curso, Finalizada).
       * Normaliza los nombres de estado de Jira a las tres categorías del dashboard.
       * @param {Array} arr - Array de tickets a clasificar
       * @returns {{ porHacer: number, enCurso: number, finalizada: number }}
       */
      const countStatuses = (arr) => {
        const porHacer = arr.filter(t => ["por hacer", "tareas por hacer", "to do", "abierto", "open"].includes((t.status || "").toLowerCase())).length;
        const enCurso = arr.filter(t => ["en curso", "in progress", "en progreso"].includes((t.status || "").toLowerCase())).length;
        const qaDev = arr.filter(t => {
            const s = (t.status || "").toLowerCase();
            return s.includes("qa en dev") || s === "qa dev" || s === "qa";
        }).length;
        const qaCert = arr.filter(t => {
            const s = (t.status || "").toLowerCase();
            return s.includes("control calidad") || s.includes("control de calidad") || s.includes("validación") || s.includes("certificación") || s.includes("certific") || s === "qa en cert";
        }).length;
        const finalizada = arr.filter(t => ["terminada", "done", "cerrado", "resuelto", "finalizado", "finalizada", "cerrada"].includes((t.status || "").toLowerCase())).length;
        return { porHacer, enCurso, qaDev, qaCert, finalizada };
      };

      /* ─── Cálculo de pendientes según el rol del usuario ─── */
      const isDevOrQA = role === "developer" || role === "qa";
      let misPendientesCount = 0;
      if (isDevOrQA) {
        // Devs/QA ven solo SUS tickets asignados
        misPendientesCount = allData.filter(t => t.assignee_email === email).length;
      } else {
        // Admins/viewers ven todos los tickets no finalizados
        misPendientesCount = allData.filter(
          (t) => !["Done", "Cerrado", "Terminada"].some((s) => (t.status || "").includes(s))
        ).length;
      }

      /* ─── Actualizar estadísticas KPI ─── */
      setStats({
        total: allData.length,
        historias: allData.filter(t => t.issue_type === "Historia" || t.issue_type === "Story").length,
        subtareas: allData.filter(t => t.issue_type === "Sub-task" || t.issue_type === "Subtarea").length,
        epicas: allData.filter(t => t.issue_type === "Epic" || t.issue_type === "Épica").length,
        pendientes: misPendientesCount,
        certificacion: countStatuses(certBugs),
        desarrollo: countStatuses(desBugs),
      });
    }

    /* ─── Historial de cambios de estado de tickets ─── */
    const { data: historyData } = await supabase
      .from("jira_ticket_status_history")
      .select("jira_key, old_status, new_status, changed_at")
      .order("changed_at", { ascending: true });

    if (historyData) {
      // Agrupar historial por clave de ticket para acceso rápido
      const historyMap = {};
      for (const entry of historyData) {
        if (!historyMap[entry.jira_key]) {
          historyMap[entry.jira_key] = [];
        }
        historyMap[entry.jira_key].push(entry);
      }
      setStatusHistory(historyMap);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ─── Fetch de datos auxiliares para resolución de nombres en JQL ─── */
  useEffect(() => {
    async function fetchJqlHelperData() {
      const [nombresRes, personsRes, equipoRes] = await Promise.all([
        supabase.from("Nombres").select("Nombre, Programador"),
        supabase.from("jira_persons").select("email, display_name"),
        supabase.from("equipo_desarrollo").select("nombre, nombre_clave, correo_pgim, correo_gcorp"),
      ]);
      if (nombresRes.data)  setJqlNombres(nombresRes.data);
      if (personsRes.data)  setJqlPersons(personsRes.data);
      if (equipoRes.data)   setJqlEquipo(equipoRes.data);
    }
    fetchJqlHelperData();
  }, [syncVersion]);

  /* ─── Helpers de JQL: resolución de nombres y épicas ─── */
  const jqlHelpers = useMemo(() => {
    // Mapas de resolución
    const nameMap = {};
    jqlNombres.forEach(n => { if (n.Programador) nameMap[n.Programador.toLowerCase()] = n.Nombre; });
    const personsMap = {};
    jqlPersons.forEach(p => { if (p.email) personsMap[p.email] = p.display_name; });
    const equipoEmailMap = {};
    const equipoKeyMap = {};
    jqlEquipo.forEach(m => {
      if (m.correo_pgim) equipoEmailMap[m.correo_pgim.toLowerCase()] = m.nombre;
      if (m.correo_gcorp && m.correo_gcorp !== "-") equipoEmailMap[m.correo_gcorp.toLowerCase()] = m.nombre;
      if (m.nombre_clave && m.nombre_clave !== "-") equipoKeyMap[m.nombre_clave.toLowerCase()] = m.nombre;
    });
    const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

    const resolveName = (email) => {
      if (!email || email.trim() === "") return "—";
      const byEmail = equipoEmailMap[email.toLowerCase()];
      if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
      const displayName = personsMap[email] || email;
      const resolved = equipoKeyMap[displayName.toLowerCase()]
        || nameMap[displayName.toLowerCase()]
        || displayName;
      return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
    };

    // Mapa de tickets y resolución de épica
    const ticketMap = {};
    tickets.forEach(t => { ticketMap[t.jira_key] = t; });

    const isStory = (type) => (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";
    const isSubtask = (type) => (type || "").toLowerCase().includes("subtare") || (type || "").toLowerCase().includes("sub-task") || (type || "").toLowerCase() === "subtask";
    const isEpic = (type) => (type || "").toLowerCase().includes("epic") || (type || "").toLowerCase().includes("épica");

    const resolveEpic = (ticket) => {
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
    };

    return { resolveName, resolveEpic, localComments: {} };
  }, [tickets, jqlNombres, jqlPersons, jqlEquipo]);

  /**
   * Maneja la sincronización manual con la API de Jira.
   * Llama al endpoint /api/sync-jira y tras completarse, refresca los datos del dashboard.
   * Muestra un toast de éxito o error que se oculta automáticamente después de 5 segundos.
   */
  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync-jira", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setSyncResult({ type: "error", message: data.error || "Error al sincronizar" });
      } else {
        setSyncResult({
          type: "success",
          message: `${data.synced} tickets sincronizados, ${data.statusChanges} cambio(s) de estado${data.deleted ? `, ${data.deleted} eliminado(s)` : ""}`,
        });
        // Refrescar datos del dashboard y limpiar caché del router
        await fetchData();
        setSyncVersion((v) => v + 1);
        router.refresh();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
    }

    setSyncing(false);

    // Ocultar notificación después de 5 segundos
    setTimeout(() => setSyncResult(null), 5000);
  }

  /**
   * Componente interno que muestra tres contadores de estado en columna:
   * Por hacer | En curso | Finalizada
   * Se usa dentro de las tarjetas KPI de errores de certificación y desarrollo.
   *
   * @param {Object} props
   * @param {{ porHacer: number, enCurso: number, finalizada: number }} props.data
   */
  const StatusCounters = ({ data }) => (
    <div className="flex flex-col w-full mt-2 gap-2">
      {/* Fila superior: 3 items */}
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex flex-col items-center flex-1">
          <span className="text-[1.1rem] md:text-xl font-bold font-[family-name:var(--font-heading)] text-gray-700 leading-none">{data.porHacer}</span>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mt-1 text-center whitespace-nowrap">Por hacer</span>
        </div>
        <div className="w-px h-5 bg-gray-200 rounded-full shrink-0"></div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-[1.1rem] md:text-xl font-bold font-[family-name:var(--font-heading)] text-blue-600 leading-none">{data.enCurso}</span>
          <span className="text-[8px] font-bold text-blue-400 uppercase tracking-wider mt-1 text-center whitespace-nowrap">En curso</span>
        </div>
        <div className="w-px h-5 bg-gray-200 rounded-full shrink-0"></div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-[1.1rem] md:text-xl font-bold font-[family-name:var(--font-heading)] text-amber-500 leading-none">{data.qaDev}</span>
          <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">QA Dev</span>
        </div>
      </div>
      
      <div className="w-full h-px bg-gray-100 rounded-full my-0.5"></div>

      {/* Fila inferior: 2 items */}
      <div className="flex items-center justify-center gap-1 w-full px-6">
        <div className="flex flex-col items-center flex-1">
          <span className="text-[1.1rem] md:text-xl font-bold font-[family-name:var(--font-heading)] text-purple-600 leading-none">{data.qaCert}</span>
          <span className="text-[8px] font-bold text-purple-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">Calidad</span>
        </div>
        <div className="w-px h-5 bg-gray-200 rounded-full shrink-0 mx-2"></div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-[1.1rem] md:text-xl font-bold font-[family-name:var(--font-heading)] text-emerald-600 leading-none">{data.finalizada}</span>
          <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider mt-1 text-center whitespace-nowrap">Finalizada</span>
        </div>
      </div>
    </div>
  );

  /**
   * Componente interno que muestra contadores clicables por tipo de ticket:
   * Historias | Subtareas | Épicas
   * Al hacer click, establece un filtro externo que se pasa a la TicketTable.
   *
   * @param {Object} props
   * @param {number} props.historias - Cantidad de historias de usuario
   * @param {number} props.subtareas - Cantidad de subtareas
   * @param {number} props.epicas - Cantidad de épicas
   */
  const TypeCounters = ({ historias, subtareas, epicas }) => (
    <div className="flex items-center gap-1.5 mt-2.5 w-full justify-between -mx-1">
      <div 
        onClick={() => setExternalFilter("Historia")} 
        className="flex flex-col items-center flex-1 cursor-pointer hover:bg-gray-100/80 rounded py-1 transition-all active:scale-95 group"
      >
        <span className="text-[1.15rem] font-bold text-gray-700 leading-none group-hover:text-blue-600 transition-colors">{historias}</span>
        <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider mt-1 text-center">Historias</span>
      </div>
      <div className="w-px h-6 bg-gray-200 shrink-0"></div>
      <div 
        onClick={() => setExternalFilter("Subtarea")} 
        className="flex flex-col items-center flex-1 cursor-pointer hover:bg-gray-100/80 rounded py-1 transition-all active:scale-95 group"
      >
        <span className="text-[1.15rem] font-bold text-gray-700 leading-none group-hover:text-blue-600 transition-colors">{subtareas}</span>
        <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider mt-1 text-center">Subt.</span>
      </div>
      <div className="w-px h-6 bg-gray-200 shrink-0"></div>
      <div 
        onClick={() => setExternalFilter("Epic")} 
        className="flex flex-col items-center flex-1 cursor-pointer hover:bg-gray-100/80 rounded py-1 transition-all active:scale-95 group"
      >
        <span className="text-[1.15rem] font-bold text-gray-700 leading-none group-hover:text-blue-600 transition-colors">{epicas}</span>
        <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider mt-1 text-center">Épicas</span>
      </div>
    </div>
  );

  /** Configuración de las 4 tarjetas KPI que se muestran en el dashboard */
  const kpiCards = [
    {
      label: "Total Tickets",
      value: (
        <div className="w-full">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">{stats.total}</span>
            {externalFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-xs font-semibold cursor-pointer hover:bg-blue-100" onClick={() => setExternalFilter("")} title="Limpiar filtro">
                {externalFilter}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </span>
            )}
          </div>
          <TypeCounters historias={stats.historias} subtareas={stats.subtareas} epicas={stats.epicas} />
        </div>
      ),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: (role === "admin" || role === "viewer") ? "Pendientes" : "Mis pendientes",
      value: stats.pendientes,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Errores Certificación",
      value: <StatusCounters data={stats.certificacion} />,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Errores Desarrollo",
      value: <StatusCounters data={stats.desarrollo} />,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="skeleton h-5 w-24 mb-3" />
              <div className="skeleton h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="skeleton h-6 w-32 mb-4" />
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
      {/* Header + Sync Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Vista General
          </h1>
          <p className="text-gray-500 mt-1">
            Resumen de todos los tickets sincronizados desde Jira
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <a
            href="https://docs.google.com/spreadsheets/d/1E_pTVHtdWGZHSVHqjj2wLoLihvVnH4Sva6PD9RF03f4/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-all hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto"
            title="Abrir Google Sheets"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="16" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="hidden md:inline">Google Sheets</span>
          </a>

          <button
            id="sync-jira-btn"
            onClick={handleSync}
            disabled={syncing}
            className={`
            inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl
            font-medium text-sm transition-all duration-300 w-full sm:w-auto
            ${syncing
                ? "bg-gray-100 text-gray-400 cursor-wait"
                : "bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/15 hover:shadow-lg hover:shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98]"
              }
          `}
          >
            {syncing ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Actualizar desde Jira
              </>
            )}
          </button>

          <button
            onClick={() => router.push("/dashboard/reportes")}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Ver Reportes
          </button>
        </div>
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up
            ${syncResult.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
            }
          `}
        >
          {syncResult.type === "success" ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {syncResult.message}
        </div>
      )}

      {/* Widget de Sprint Actual */}
      {currentSprint && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 shadow-sm animate-fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600 shadow-sm border border-emerald-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold font-[family-name:var(--font-heading)] text-emerald-900 border-b-2 border-emerald-600/30 w-max pb-0.5">
                        {currentSprint.iteracion}
                    </h2>
                    <p className="text-sm font-medium text-emerald-700 mt-1.5 flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Inició: {formatCronogramaDate(currentSprint.fechaInicio)} — Finaliza: {formatCronogramaDate(currentSprint.fechaFin)}
                    </p>
                </div>
            </div>

            {daysLeft !== null && (
                <div className="bg-white rounded-xl py-3 px-6 shadow-sm border border-emerald-100 flex flex-col items-center justify-center min-w-[140px] w-full md:w-auto mt-2 md:mt-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Entregable en</p>
                    <div className="flex items-baseline gap-1.5">
                        <span className={`text-3xl font-black ${daysLeft <= 3 ? "text-red-500" : daysLeft <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                            {daysLeft > 0 ? daysLeft : 0}
                        </span>
                        <span className="text-sm font-medium text-gray-500">días</span>
                    </div>
                </div>
            )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={kpi.label} hover className={`animate-slide-up stagger-${index + 1}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 w-full min-w-0 pr-2">
                <p className="text-gray-500 text-sm font-medium">{kpi.label}</p>
                {typeof kpi.value === "number" || typeof kpi.value === "string" ? (
                  <p className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 mt-1">
                    {kpi.value}
                  </p>
                ) : (
                  <div className="w-full">
                    {kpi.value}
                  </div>
                )}
              </div>
              <div className={`p-2.5 rounded-xl shrink-0 ${kpi.bg}`}>
                <span className={kpi.color}>{kpi.icon}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Búsqueda avanzada JQL */}
      <JqlSearchBar
        tickets={tickets}
        onResults={setJqlResults}
        onActiveChange={setJqlActive}
        helpers={jqlHelpers}
      />

      {/* Tickets Table */}
      <TicketTable
        tickets={jqlActive && jqlResults ? jqlResults : tickets}
        title={jqlActive && jqlResults ? `Resultados JQL (${jqlResults.length})` : "Todos los Tickets"}
        statusHistory={statusHistory}
        externalFilterType={externalFilter}
        defaultFilterSprint=""
        syncVersion={syncVersion}
        jqlActive={jqlActive}
      />
    </div>
  );
}
