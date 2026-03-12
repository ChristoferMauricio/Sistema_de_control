"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import IncidenciasTable from "@/components/IncidenciasTable";
import { useRole } from "../RoleContext";

export default function IncidenciasPage() {
  const { role, loading: roleLoading } = useRole();
  const [incidencias, setIncidencias] = useState([]);
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
        const match = s.summary.match(/\((Iteraci[oó]n \d+)\)/i);
        iterationMap[s.jira_key] = match ? match[1] : "Iteración Desconocida";
      });

      // 2. Fetch subtasks belonging to these stories
      const { data: subtasks, error: subtasksError } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, assignee_name, created_at, parent_key")
        .eq("issue_type", "Subtarea")
        .in("parent_key", parentKeys)
        .order("created_at", { ascending: false });

      if (subtasksError) {
        console.error("Error fetching subtasks:", subtasksError);
        setLoading(false);
        return;
      }

      // 3. Fetch Nombres mapping
      const { data: nombresData, error: nombresError } = await supabase
        .from("Nombres")
        .select("Nombre, Programador");

      const nombreMap = {};
      if (!nombresError && nombresData) {
        nombresData.forEach((n) => {
          if (n.Programador) {
            nombreMap[n.Programador.toLowerCase()] = n.Nombre;
          }
        });
      }

      // 4. Transform data for the table
      const formattedData = (subtasks || []).map((t) => {
        // Try to match exact or partial name logic. Usually Jira assignee_name is like "John Doe".
        // The Nombres table logic assumes mapping based on Programador logic or direct name.
        // We will do a generic pass.
        let resolvedName = t.assignee_name || "Sin Asignar";
        
        // Example resolution logic based on common patterns:
        const lowerAssignee = (t.assignee_name || "").toLowerCase();
        
        // Find best match in Nombres
        if (nombreMap[lowerAssignee]) {
            resolvedName = nombreMap[lowerAssignee];
        } else {
            // Partial match fallback
            const match = nombresData?.find(n => 
              n.Programador && lowerAssignee.includes(n.Programador.toLowerCase()) ||
              n.Nombre && lowerAssignee.includes(n.Nombre.toLowerCase())
            );
            if (match) {
                resolvedName = match.Nombre;
            }
        }

        return {
          id: t.jira_key,
          clave: t.jira_key,
          resumen: t.summary,
          estado: t.status,
          creado: t.created_at,
          iteracion: iterationMap[t.parent_key] || "Iteración Desconocida",
          asignado: resolvedName,
          asignado_original: t.assignee_name // Kept for debugging
        };
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
      <IncidenciasTable incidencias={incidencias} role={role} />
    </div>
  );
}
