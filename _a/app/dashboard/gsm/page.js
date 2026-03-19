"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

export default function GSMPage() {
  const [personal, setPersonal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [filterNombre, setFilterNombre] = useState("");
  const [filterModalidad, setFilterModalidad] = useState("");
  const [filterCargo, setFilterCargo] = useState("");

  useEffect(() => {
    async function fetchPersonal() {
      try {
        const { data, error } = await supabase
          .from("gsm")
          .select("*");

        if (error) {
          throw error;
        }

        if (data) {
          setPersonal(data);
        }
      } catch (err) {
        console.error("Error fetching GSM info:", err);
        setError("Error al cargar la información. Asegúrate de ejecutar el script SQL en Supabase.");
      } finally {
        setLoading(false);
      }
    }

    fetchPersonal();
  }, []);

  // Función para determinar el peso jerárquico del cargo para ordenarlos
  const getCargoWeight = (cargo) => {
    const c = cargo.toLowerCase();
    if (c.includes("gerente")) return 1;
    if (c.includes("coordinador")) return 2;
    if (c.includes("senior") || c.includes("asesor")) return 3;
    if (c.includes("especialista")) return 4;
    if (c.includes("abogado") && !c.includes("asistente")) return 5;
    if (c.includes("analista")) return 6;
    if (c.includes("asistente")) return 7;
    if (c.includes("practicante")) return 8;
    return 9; // Otros
  };

  const filteredAndSorted = useMemo(() => {
    // 1. Filtrar
    let result = personal.filter((p) => {
      const matchNombre = p.nombre.toLowerCase().includes(filterNombre.toLowerCase());
      const matchModalidad = p.modalidad.toLowerCase().includes(filterModalidad.toLowerCase());
      const matchCargo = p.cargo.toLowerCase().includes(filterCargo.toLowerCase());
      return matchNombre && matchModalidad && matchCargo;
    });

    // 2. Ordenar por jerarquía (peso) y luego alfabéticamente por nombre
    result.sort((a, b) => {
      const weightA = getCargoWeight(a.cargo);
      const weightB = getCargoWeight(b.cargo);
      
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return a.nombre.localeCompare(b.nombre);
    });

    return result;
  }, [personal, filterNombre, filterModalidad, filterCargo]);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <div className="skeleton h-8 w-56 mb-2" />
            <div className="skeleton h-5 w-96" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 p-6 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 px-6 py-4 rounded-xl border border-red-200 font-medium shadow-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-cyan-50 border border-cyan-100 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
              Información GSM
            </h1>
          </div>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Directorio del personal perteneciente a la Gerencia de Supervisión Minera.
          </p>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-slide-up flex flex-col">
          {personal.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Sin información</h3>
              <p className="text-gray-500">No se encontraron registros de GSM. Ejecuta el script SQL en Supabase para sincronizar la tabla.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative min-h-0 bg-white">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-[11px] text-gray-500 uppercase bg-gray-50/80 sticky top-0 z-10 font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-3 border-b border-gray-200">
                      <div className="flex flex-col gap-2">
                        <span>Nombre del trabajador</span>
                        <input 
                          type="text" 
                          placeholder="Buscar nombre..." 
                          value={filterNombre}
                          onChange={(e) => setFilterNombre(e.target.value)}
                          className="px-2 py-1.5 rounded border border-gray-200 font-normal normal-case text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                    </th>
                    <th className="px-5 py-3 border-b border-gray-200">
                      <div className="flex flex-col gap-2">
                        <span>Modalidad</span>
                        <input 
                          type="text" 
                          placeholder="Buscar modalidad..." 
                          value={filterModalidad}
                          onChange={(e) => setFilterModalidad(e.target.value)}
                          className="px-2 py-1.5 rounded border border-gray-200 font-normal normal-case text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 w-32"
                        />
                      </div>
                    </th>
                    <th className="px-5 py-3 border-b border-gray-200">
                      <div className="flex flex-col gap-2">
                        <span>Cargo</span>
                        <input 
                          type="text" 
                          placeholder="Buscar cargo..." 
                          value={filterCargo}
                          onChange={(e) => setFilterCargo(e.target.value)}
                          className="px-2 py-1.5 rounded border border-gray-200 font-normal normal-case text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      </div>
                    </th>
                    <th className="px-5 py-3 border-b border-gray-200 align-top pt-8">Correo Electrónico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium">
                  {filteredAndSorted.length === 0 ? (
                     <tr>
                       <td colSpan={4} className="px-6 py-8 text-center text-gray-400 font-normal">
                         No hay resultados para los filtros aplicados.
                       </td>
                     </tr>
                  ) : (
                    filteredAndSorted.map((miembro) => {
                      const w = getCargoWeight(miembro.cargo);
                      const isGerencia = w === 1 || w === 2;
                      const isPracticante = w === 8;

                      let rowClass = "hover:bg-cyan-50/30 transition-colors group";
                      if (isGerencia) rowClass += " bg-amber-50/20";
                      
                      let badgeClass = "bg-gray-50 text-gray-600 border-gray-200";
                      if (isGerencia) badgeClass = "bg-amber-100 text-amber-800 border-amber-200";
                      else if (w === 3 || w === 4) badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
                      else if (isPracticante) badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";

                      return (
                        <tr key={miembro.id} className={rowClass}>
                          <td className="px-5 py-3 border-r border-gray-100 text-gray-900 font-bold text-xs">
                            {miembro.nombre}
                          </td>
                          <td className="px-5 py-3 border-r border-gray-100">
                            <span className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded font-mono text-xs border border-gray-200">
                              {miembro.modalidad}
                            </span>
                          </td>
                          <td className="px-5 py-3 border-r border-gray-100">
                            <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md border shadow-sm whitespace-normal block ${badgeClass}`}>
                              {miembro.cargo}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <a href={`mailto:${miembro.correo}`} className="text-blue-600 hover:underline flex items-center gap-1.5 focus:outline-none text-xs font-normal">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                              </svg>
                              {miembro.correo}
                            </a>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <div className="bg-gray-50 border-t border-gray-200 px-5 py-3">
                <p className="text-xs text-gray-500 font-medium tracking-wide">
                  Mostrando <span className="text-gray-900 font-bold">{filteredAndSorted.length}</span> de {personal.length} miembros.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
