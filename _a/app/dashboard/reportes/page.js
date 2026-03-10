"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ReportesTable from "@/components/ReportesTable";

export default function ReportesPage() {
    const [tickets, setTickets] = useState([]);
    const [nombres, setNombres] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchData = useCallback(async () => {
        let allData = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase
                .from("jira_tickets")
                .select("*")
                .order("updated_at", { ascending: false })
                .range(from, from + pageSize - 1);

            if (error || !data) { hasMore = false; break; }
            allData = [...allData, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
        }

        setTickets(allData);

        // Fetch Nombres
        const { data: nombresData } = await supabase
            .from("Nombres")
            .select("*");
        if (nombresData) setNombres(nombresData);

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const lastUpdated = useMemo(() => {
        if (tickets.length === 0) return null;
        let max = null;
        tickets.forEach((t) => {
            const d = t.synced_at ? new Date(t.synced_at) : null;
            if (d && (!max || d > max)) max = d;
        });
        return max;
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
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
                        Reportes
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Tablas dinámicas y resúmenes de las historias de usuario
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Última actualización: <strong className="text-gray-700">{lastUpdated.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })} {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</strong></span>
                        </div>
                    )}
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Volver a Vista General
                    </button>
                </div>
            </div>

            {/* Tabla 01: Historias por Integrante y Estado */}
            <ReportesTable tickets={tickets} nombres={nombres} />
        </div>
    );
}
