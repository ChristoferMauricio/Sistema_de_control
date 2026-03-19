"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ObsTable from "@/components/ObsTable";

export default function ObservacionesSupervisorPage() {
  const [tickets, setTickets] = useState([]);
  const [nombresData, setNombresData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const [ticketsRes, nombresRes] = await Promise.all([
          supabase
            .from("jira_tickets")
            .select("*")
            .not("comentario", "is", null)
            .neq("comentario", ""),
          supabase
            .from("Nombres")
            .select("*")
        ]);

        if (ticketsRes.error) throw ticketsRes.error;
        if (nombresRes.error) throw nombresRes.error;

        const validTickets = ticketsRes.data || [];
        const filteredTickets = validTickets.filter((t) => t.comentario && t.comentario.trim().length > 0);

        setTickets(filteredTickets);
        setNombresData(nombresRes.data || []);
      } catch (err) {
        console.error("Error fetching observaciones data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <div className="skeleton h-8 w-64 mb-2" />
            <div className="skeleton h-5 w-96" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto p-6 text-red-500">
        Error cargando datos: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
            Observaciones del Supervisor
          </h1>
          <p className="text-gray-500 mt-1">
            Revisión de todas las observaciones y comentarios registrados en los tickets.
          </p>
        </div>

        <div className="glass rounded-2xl shadow-sm border border-gray-200 overflow-hidden bg-white">
          <ObsTable 
            tickets={tickets} 
            nombresData={nombresData} 
          />
        </div>
      </div>
    </div>
  );
}
