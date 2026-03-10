"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import ObservacionesTable from "@/components/ObservacionesTable";

export default function ObservacionesPage() {
  const [observaciones, setObservaciones] = useState([]);
  const [nombres, setNombres] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // Fetch observaciones
    const { data: obsData } = await supabase
      .from("observaciones")
      .select("*")
      .order("id", { ascending: false });

    if (obsData) setObservaciones(obsData);

    // Fetch nombres
    const { data: nombresData } = await supabase
      .from("Nombres")
      .select("*")
      .order("Nombre", { ascending: true });

    if (nombresData) setNombres(nombresData);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
          Observaciones
        </h1>
        <p className="text-gray-500 mt-1">
          Registro y seguimiento de observaciones detectadas
        </p>
      </div>

      <ObservacionesTable
        observaciones={observaciones}
        nombres={nombres}
        onRefresh={fetchData}
      />
    </div>
  );
}
