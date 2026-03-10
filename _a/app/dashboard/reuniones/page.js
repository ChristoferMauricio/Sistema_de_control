"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import ReunionesTable from "@/components/ReunionesTable";

export default function ReunionesPage() {
    const [reuniones, setReuniones] = useState([]);
    const [nombres, setNombres] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        // Fetch reuniones
        const { data: reunionesData } = await supabase
            .from("reuniones")
            .select("*")
            .order("id", { ascending: false });

        if (reunionesData) setReuniones(reunionesData);

        // Fetch nombres
        const { data: nombresData } = await supabase
            .from("Nombres")
            .select("*")
            .order("Nombre", { ascending: true });

        if (nombresData) setNombres(nombresData);

        // Fetch tickets (for sprint list)
        const { data: ticketData } = await supabase
            .from("jira_tickets")
            .select("sprint")
            .not("sprint", "is", null);

        if (ticketData) setTickets(ticketData);

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Extract unique sprints and format as "Sprint XX"
    const sprints = useMemo(() => {
        const raw = [...new Set(tickets.map((t) => t.sprint).filter(Boolean))];
        // Convert "Iteración F3.12" → "Sprint 12"
        const formatted = raw.map((s) => {
            const match = s.match(/(\d+)$/);
            return match ? `Sprint ${match[1]}` : s;
        });
        return [...new Set(formatted)].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.replace(/\D/g, "")) || 0;
            return numA - numB;
        });
    }, [tickets]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="skeleton h-8 w-48 mb-2" />
                    <div className="skeleton h-4 w-64" />
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="skeleton h-6 w-40 mb-4" />
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
        <div className="space-y-6 animate-fade-in">
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 rounded-xl bg-orange-50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
                        Reuniones
                    </h1>
                </div>
                <p className="text-gray-500 mt-1">
                    Programación y seguimiento de reuniones internas y con clientes
                </p>
            </div>

            <ReunionesTable
                reuniones={reuniones}
                sprints={sprints}
                nombres={nombres}
                onRefresh={fetchData}
            />
        </div>
    );
}
