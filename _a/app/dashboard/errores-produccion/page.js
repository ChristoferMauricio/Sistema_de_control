"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";

export default function ErroresProduccionPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTickets() {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("*")
        .ilike("status", "%producci%")
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setTickets(data);
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
        <div className="glass rounded-2xl p-6">
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
          <div className="p-2 rounded-xl bg-red-500/15">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-foreground">
            Errores de Producción
          </h1>
        </div>
        <p className="text-secondary-text mt-2">
          Tickets con errores reportados en el entorno de producción
        </p>
      </div>

      {/* Stats banner */}
      <div className="glass rounded-xl px-5 py-3 inline-flex items-center gap-3 animate-fade-in">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm text-secondary-text">
          <span className="font-semibold text-foreground">{tickets.length}</span> ticket{tickets.length !== 1 ? "s" : ""} en producción
        </span>
      </div>

      {/* Table */}
      <TicketTable tickets={tickets} title="Tickets en Producción" />
    </div>
  );
}
