"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";

export default function ErroresCertificacionPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTickets() {
      // 1. Fetch PF3QA bugs from active Sprint 2
      const { data: bugsQA, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority")
        .in("issue_type", ["Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"])
        .like("jira_key", "PF3QA-%")
        .eq("sprint", "Tablero Sprint 2")
        .order("updated_at", { ascending: false });

      if (!error && bugsQA && bugsQA.length > 0) {
        const bugKeys = bugsQA.map(b => b.jira_key);

        // 2. Obtener links desde jira_ticket_links (tabla normalizada)
        const { data: linkRows } = await supabase
          .from("jira_ticket_links")
          .select("source_key, target_key")
          .in("source_key", bugKeys);

        // Mapa: bugKey → [targetKeys]
        const linksMap = {};
        for (const row of linkRows || []) {
          if (!linksMap[row.source_key]) linksMap[row.source_key] = [];
          linksMap[row.source_key].push(row.target_key);
        }

        // 3. Obtener sprints de los tickets vinculados
        const allTargetKeys = Array.from(new Set(Object.values(linksMap).flat()));
        const linkedStoriesMap = {};
        if (allTargetKeys.length > 0) {
          const { data: linkedStories } = await supabase
            .from("jira_tickets")
            .select("jira_key, sprint")
            .in("jira_key", allTargetKeys);
          (linkedStories || []).forEach(st => {
            linkedStoriesMap[st.jira_key] = st.sprint || "";
          });
        }

        // 4. Filtrar bugs que apuntan a Certificación (F3.01 y F3.02)
        const certBugs = bugsQA.filter(bug => {
          const targets = linksMap[bug.jira_key] || [];
          return targets.some(tk => {
            const sprint = linkedStoriesMap[tk] || "";
            return sprint.includes("F3.01") || sprint.includes("F3.02");
          });
        });

        // 5. Adjuntar storySprint para la tabla
        const updatedTickets = certBugs.map(b => {
          const targets = linksMap[b.jira_key] || [];
          const sprints = [...new Set(targets.map(tk => linkedStoriesMap[tk]).filter(Boolean))];
          return { ...b, storySprint: sprints.join(", ") || "—" };
        });

        setTickets(updatedTickets);
      }
      setLoading(false);
    }

    fetchTickets();
  }, []);

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
          <div className="p-2 rounded-xl bg-purple-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Errores de Certificación
          </h1>
        </div>
        <p className="text-gray-500 mt-2">
          Errores Sprint 2 cuyas historias vinculadas pertenecen a Sprint 1 o Sprint 2
        </p>
      </div>

      {/* Stats banner */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 inline-flex items-center gap-3 animate-fade-in shadow-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
        <span className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{tickets.length}</span> ticket{tickets.length !== 1 ? "s" : ""} en certificación
        </span>
      </div>

      {/* Table */}
      <TicketTable tickets={tickets} title="Tickets en Certificación" mode="errores" />
    </div>
  );
}
