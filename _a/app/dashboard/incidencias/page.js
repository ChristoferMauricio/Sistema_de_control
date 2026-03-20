"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import IncidenciasTable from "@/components/IncidenciasTable";
import { useRole } from "../RoleContext";

export default function IncidenciasPage() {
  const { role, loading: roleLoading } = useRole();
  const [incidencias, setIncidencias] = useState([]);
  const [gsmData, setGsmData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      // 1. Fetch parent stories that represent Iterations under Epic PF3-1799
      // These stories have "Iteración" in their summary.
      const { data: parentStories, error: parentsError } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary")
        .ilike("summary", "%(Iteraci%n %)%");

      if (parentsError || !parentStories || parentStories.length === 0) {
        console.error("Error fetching iteration stories:", parentsError);
        setLoading(false);
        return;
      }

      const parentKeys = parentStories.map((s) => s.jira_key);
      
      // Parse iteration name from summary for mapping later
      const iterationMap = {};
      parentStories.forEach((s) => {
        // e.g. "APRE. Acompañamiento y atención de incidencias en uso del sistema (iteración 6)"
        const match = s.summary.match(/\(Iteraci[oó]n (\d+)\)/i);
        iterationMap[s.jira_key] = match ? `Iteración ${Number(match[1])}` : "Iteración Desconocida";
      });

      // 2. Fetch subtasks belonging to these stories
      const { data: subtasks, error: subtasksError } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, assignee_email, created_at, parent_key, description")
        .eq("issue_type", "Subtarea")
        .in("parent_key", parentKeys)
        .order("created_at", { ascending: false });

      // Fetch GSM for description matching
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

      // 3. Fetch name resolution tables
      const [nombresRes, equipoRes, personsRes] = await Promise.all([
        supabase.from("Nombres").select("Nombre, Programador"),
        supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
        supabase.from("jira_persons").select("email, display_name"),
      ]);

      const nombreMap = {};
      (nombresRes.data || []).forEach((n) => {
        if (n.Programador) nombreMap[n.Programador.toLowerCase()] = n.Nombre;
      });

      const equipoEmailMap = {};
      const equipoKeyMap = {};
      (equipoRes.data || []).forEach((e) => {
        if (e.correo_pgim) equipoEmailMap[e.correo_pgim.toLowerCase()] = e.nombre;
        if (e.correo_gcorp) equipoEmailMap[e.correo_gcorp.toLowerCase()] = e.nombre;
        if (e.nombre_clave) equipoKeyMap[e.nombre_clave.toLowerCase()] = e.nombre;
      });

      const personsMap = {};
      (personsRes.data || []).forEach((p) => {
        if (p.email && p.display_name) personsMap[p.email.toLowerCase()] = p.display_name;
      });

      function resolveName(email) {
        if (!email || email.trim() === "") return "Sin Asignar";
        const key = email.toLowerCase();
        if (equipoEmailMap[key]) return equipoEmailMap[key];
        const displayName = personsMap[key] || email;
        return equipoKeyMap[displayName.toLowerCase()] || nombreMap[displayName.toLowerCase()] || displayName;
      }

      // 4. Transform data for the table
      const formattedData = (subtasks || []).map((t) => {
        const resolvedName = resolveName(t.assignee_email);

        return {
          id: t.jira_key,
          clave: t.jira_key,
          resumen: t.summary,
          estado: t.status,
          creado: t.created_at,
          description: t.description, // Added description propagation
          iteracion: iterationMap[t.parent_key] || "Iteración Desconocida",
          asignado: resolvedName,
          asignado_original: t.assignee_email // Kept for debugging
        };
      });

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
