"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TicketTable from "@/components/TicketTable";

export default function MisPendientesPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function fetchMyTickets() {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email || "";
      setUserEmail(email);

      const { data, error } = await supabase
        .from("jira_tickets")
        .select("*")
        .eq("assignee_email", email)
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setTickets(data);
      }

      setLoading(false);
    }

    fetchMyTickets();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-5 w-72" />
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
        <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
          Mis Pendientes
        </h1>
        <p className="text-gray-500 mt-1">
          Tickets asignados a <span className="text-orange-600 font-medium">{userEmail}</span>
        </p>
      </div>

      {/* Info banner */}
      {tickets.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center animate-fade-in shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">¡Sin pendientes!</h3>
          <p className="text-gray-500 text-sm">No tienes tickets asignados en este momento.</p>
        </div>
      )}

      {/* Table */}
      {tickets.length > 0 && (
        <TicketTable tickets={tickets} title="Mis Tickets Asignados" showAssignee={false} />
      )}
    </div>
  );
}
