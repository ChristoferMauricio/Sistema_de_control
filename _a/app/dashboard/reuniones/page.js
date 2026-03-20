/**
 * @file reuniones/page.js - Página de gestión de reuniones
 * @description Permite programar y hacer seguimiento de reuniones internas y con clientes.
 *              Carga datos de tres fuentes:
 *              - Tabla "reuniones": registros de reuniones existentes
 *              - Tabla "Nombres": lista de integrantes del equipo
 *              - Tabla "jira_tickets": sprints únicos (para asociar reuniones a sprints)
 *
 *              Los sprints se obtienen con paginación para superar el límite de 1000 filas.
 *
 * @route /dashboard/reuniones
 * @requires supabase - Cliente de Supabase para consultar reuniones, nombres y sprints
 * @requires ReunionesTable - Componente de tabla con CRUD de reuniones
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import ReunionesTable from "@/components/ReunionesTable";

/**
 * Componente de página de reuniones con carga de datos y tabla interactiva.
 *
 * @returns {JSX.Element} Página con header y tabla de reuniones
 *
 * Estados locales:
 * - reuniones: Array de registros de reuniones desde Supabase
 * - nombres: Array de integrantes del equipo (Nombre + Programador)
 * - tickets: Array de objetos con campo sprint (para extraer sprints únicos)
 * - loading: Estado de carga inicial
 */
export default function ReunionesPage() {
    const [reuniones, setReuniones] = useState([]);
    const [nombres, setNombres] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    /**
     * Carga todos los datos necesarios para la página de reuniones.
     * Se ejecuta al montar el componente.
     */
    const fetchData = useCallback(async () => {
        // Obtener registros de reuniones ordenados por ID descendente (más recientes primero)
        const { data: reunionesData } = await supabase
            .from("reuniones")
            .select("*")
            .order("id", { ascending: false });

        if (reunionesData) setReuniones(reunionesData);

        // Obtener lista de integrantes del equipo ordenados alfabéticamente
        const { data: nombresData } = await supabase
            .from("Nombres")
            .select("*")
            .order("Nombre", { ascending: true });

        if (nombresData) setNombres(nombresData);

        /* ─── Obtener sprints únicos (paginado para superar límite de 1000 filas) ─── */
        let allSprints = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
            const { data } = await supabase
                .from("jira_tickets")
                .select("sprint")
                .not("sprint", "is", null)
                .range(from, from + pageSize - 1);
            if (!data || data.length === 0) { hasMore = false; break; }
            allSprints = [...allSprints, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
        }
        setTickets(allSprints);

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Extrae los nombres únicos de sprints de todos los tickets de Jira.
     * Se memoriza para evitar recalcular en cada render.
     * @returns {string[]} Array ordenado de nombres de sprints únicos
     */
    const sprints = useMemo(() => {
        return [...new Set(tickets.map((t) => t.sprint).filter(Boolean))].sort();
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
