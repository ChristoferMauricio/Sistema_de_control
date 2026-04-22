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

import { useEffect, useState } from "react";
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

  useEffect(() => {
    /**
     * Carga y transforma los datos de incidencias desde múltiples tablas de Supabase.
     * Resuelve nombres de usuarios y clasifica incidencias por iteración.
     */
    async function fetchData() {
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

        return {
          id: t.jira_key,
          clave: t.jira_key,
          resumen: t.summary,
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
    }

    fetchData();
  }, []);

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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 transition-colors">
          Incidencias
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">
          Listado de subtareas reportadas durante las iteraciones de estabilización.
        </p>
      </div>

      {/* Table Component */}
      <IncidenciasTable incidencias={incidencias} role={role} gsmData={gsmData} />
    </div>
  );
}
