/**
 * @file incidencias/page.js - Página de incidencias reportadas
 * @description Muestra el listado de subtareas (incidencias) reportadas durante las
 *              iteraciones de estabilización del sistema. Las incidencias son subtareas
 *              de historias padre que representan iteraciones bajo la Épica PF3-1799.
 *
 *              Flujo de datos:
 *              1. Busca historias padre con "Iteración" en su resumen
 *              2. Obtiene las subtareas pertenecientes a esas historias
 *              3. Carga datos del GSM para matching de descripciones
 *              4. Resuelve nombres de asignados usando múltiples tablas de mapeo
 *              5. Transforma y formatea los datos para el componente IncidenciasTable
 *
 *              Tablas de resolución de nombres (en orden de prioridad):
 *              - equipo_desarrollo (por correo PGIM/GCORP)
 *              - jira_persons (por email → display_name)
 *              - Nombres (por nombre clave del programador)
 *
 * @route /dashboard/incidencias
 * @requires supabase - Cliente de Supabase para consultas
 * @requires IncidenciasTable - Componente de tabla especializado en incidencias
 * @requires useRole - Hook para obtener el rol del usuario
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import IncidenciasTable from "@/components/IncidenciasTable";
import { useRole } from "../RoleContext";

/**
 * Componente de página de incidencias con resolución de nombres y agrupación por iteración.
 *
 * @returns {JSX.Element} Tabla de incidencias con filtros por iteración y estado
 */
export default function IncidenciasPage() {
  const { role, loading: roleLoading } = useRole();
  const [incidencias, setIncidencias] = useState([]); // Datos formateados para la tabla
  const [gsmData, setGsmData] = useState([]);          // Datos del personal GSM
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const router = useRouter();

  /**
   * Carga y transforma los datos de incidencias desde múltiples tablas de Supabase.
   * Resuelve nombres de usuarios y clasifica incidencias por iteración.
   */
  const fetchData = useCallback(async () => {
      /* ─── Paso 1: Obtener historias padre que representan iteraciones ─── */
      // Busca tickets cuyo resumen contiene "(Iteración N)" bajo la Épica PF3-1799
      const { data: parentStories, error: parentsError } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary")
        .is("deleted_at", null)
        .ilike("summary", "%(Iteraci%n %)%");

      if (parentsError || !parentStories || parentStories.length === 0) {
        console.error("Error fetching iteration stories:", parentsError);
        setLoading(false);
        return;
      }

      const parentKeys = parentStories.map((s) => s.jira_key);

      // Extraer el número de iteración del resumen para mapeo posterior
      // Ejemplo: "APRE. Acompañamiento... (iteración 6)" → "Iteración 6"
      const iterationMap = {};
      parentStories.forEach((s) => {
        const match = s.summary.match(/\(Iteraci[oó]n (\d+)\)/i);
        iterationMap[s.jira_key] = match ? `Iteración ${Number(match[1])}` : "Iteración Desconocida";
      });

      /* ─── Paso 2: Obtener subtareas de las historias padre ─── */
      const { data: subtasks, error: subtasksError } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, assignee_email, created_at, updated_at, parent_key, description, fecha_inicio, fecha_solucion")
        .is("deleted_at", null)
        .eq("issue_type", "Subtarea")
        .in("parent_key", parentKeys)
        .order("created_at", { ascending: false });

      // Cargar datos del GSM para matching de descripciones en la tabla
      const { data: gsm, error: gsmError } = await supabase
        .from("gsm")
        .select("id, nombre, modalidad, cargo, correo");

      if (gsm && !gsmError) {
        setGsmData(gsm);
      }

      if (subtasksError) {
        console.error("Error fetching subtasks:", subtasksError);
        setLoading(false);
        return;
      }

      /* ─── Paso 3: Cargar tablas de resolución de nombres ─── */
      // Se consultan 3 tablas en paralelo para resolver email → nombre completo
      const [nombresRes, equipoRes, personsRes] = await Promise.all([
        supabase.from("Nombres").select("Nombre, Programador"),
        supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
        supabase.from("jira_persons").select("email, display_name"),
      ]);

      // Construir mapas de resolución de nombres
      const nombreMap = {};
      (nombresRes.data || []).forEach((n) => {
        if (n.Programador) nombreMap[n.Programador.toLowerCase()] = n.Nombre;
      });

      const equipoEmailMap = {};  // correo → nombre completo
      const equipoKeyMap = {};    // nombre_clave → nombre completo
      (equipoRes.data || []).forEach((e) => {
        if (e.correo_pgim) equipoEmailMap[e.correo_pgim.toLowerCase()] = e.nombre;
        if (e.correo_gcorp) equipoEmailMap[e.correo_gcorp.toLowerCase()] = e.nombre;
        if (e.nombre_clave) equipoKeyMap[e.nombre_clave.toLowerCase()] = e.nombre;
      });

      const personsMap = {};  // email → display_name de Jira
      (personsRes.data || []).forEach((p) => {
        if (p.email && p.display_name) personsMap[p.email.toLowerCase()] = p.display_name;
      });

      /**
       * Resuelve un email de Jira a nombre completo del integrante.
       * Prioridad: equipo_desarrollo (email) → jira_persons → Nombres → email original
       * @param {string} email - Email del asignado en Jira
       * @returns {string} Nombre resuelto o "Sin Asignar"
       */
      function resolveName(email) {
        if (!email || email.trim() === "") return "Sin Asignar";
        const key = email.toLowerCase();
        if (equipoEmailMap[key]) return equipoEmailMap[key];
        const displayName = personsMap[key] || email;
        return equipoKeyMap[displayName.toLowerCase()] || nombreMap[displayName.toLowerCase()] || displayName;
      }

      /* ─── Paso 4: Transformar datos para la tabla de incidencias ─── */
      const formattedData = (subtasks || []).map((t) => {
        const resolvedName = resolveName(t.assignee_email);

        // Extraer etiqueta: texto antes del separador "|" en el resumen
        const pipeIndex = t.summary ? t.summary.indexOf("|") : -1;
        const etiqueta = pipeIndex !== -1 ? t.summary.substring(0, pipeIndex).trim() : "";

        return {
          id: t.jira_key,
          clave: t.jira_key,
          resumen: t.summary,
          etiqueta,
          estado: t.status,
          creado: t.created_at,
          actualizado: t.updated_at,
          fecha_inicio: t.fecha_inicio,
          fecha_solucion: t.fecha_solucion,
          description: t.description,
          iteracion: iterationMap[t.parent_key] || "Iteración Desconocida",
          asignado: resolvedName,
          asignado_original: t.assignee_email // Se mantiene para depuración
        };
      });

      // Log de depuración para tickets específicos (desarrollo)
      console.log("DEBUG: Raw descriptions from Supabase:");
      formattedData.forEach(item => {
        if (item.clave.includes("3177") || item.clave.includes("3176") || item.clave.includes("3175")) {
          console.log(`${item.clave} - DESC:`, item.description);
        }
      });

      setIncidencias(formattedData);
      setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        await fetchData();
        router.refresh();
      }
    } catch (err) {
      setSyncResult({ type: "error", message: "Error de conexión con el servidor" });
    }

    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  }

  if (roleLoading || loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <div className="skeleton h-8 w-48 mb-2" />
            <div className="skeleton h-5 w-72" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 transition-colors">
            Incidencias
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">
            Listado de subtareas reportadas durante las iteraciones de estabilización.
          </p>
        </div>

        <button
          id="sync-jira-btn"
          onClick={handleSync}
          disabled={syncing}
          className={`
            inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl
            font-medium text-sm transition-all duration-300 w-full sm:w-auto
            ${syncing
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait"
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
      </div>

      {/* Sync result toast */}
      {syncResult && (
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-slide-up
            ${syncResult.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50"
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

      {/* Table Component */}
      <IncidenciasTable incidencias={incidencias} role={role} gsmData={gsmData} />
    </div>
  );
}
