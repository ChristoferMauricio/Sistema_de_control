"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function EquipoDesarrolloPage() {
  const [equipo, setEquipo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchEquipo() {
      try {
        const { data, error } = await supabase
          .from("equipo_desarrollo")
          .select("*")
          .order("id", { ascending: true });

        if (error) {
          throw error;
        }

        if (data) {
          setEquipo(data);
        }
      } catch (err) {
        console.error("Error fetching equipo:", err);
        setError("Error al cargar la información del equipo.");
      } finally {
        setLoading(false);
      }
    }

    fetchEquipo();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50/50 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        <p className="text-gray-500 font-medium">Cargando información del equipo...</p>
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
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
              Equipo de Desarrollo
            </h1>
          </div>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Información de contacto y roles de todos los miembros del equipo de desarrollo del proyecto.
          </p>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-slide-up">
          {equipo.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Sin información</h3>
              <p className="text-gray-500">No se encontraron registros del equipo de desarrollo. Ejecuta el script SQL en Supabase para sincronizar la tabla.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative min-h-0 bg-white">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-[11px] text-gray-500 uppercase bg-gray-50/80 sticky top-0 z-10 font-bold tracking-wider">
                  <tr>
                    <th className="px-5 py-4 border-b border-r border-gray-200">Rol</th>
                    <th className="px-5 py-4 border-b border-r border-gray-200">Nombre</th>
                    <th className="px-5 py-4 border-b border-r border-gray-200">Nombre clave</th>
                    <th className="px-5 py-4 border-b border-r border-gray-200">Correo PGIM</th>
                    <th className="px-5 py-4 border-b border-gray-200">Correo GCORP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-medium">
                  {equipo.map((miembro) => (
                    <tr key={miembro.id} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-5 py-3 border-r border-gray-100">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-md border shadow-sm ${
                          miembro.rol === 'Líder de Equipo' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          miembro.rol === 'Supervisor' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          miembro.rol === 'Analista de Sistemas' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          miembro.rol === 'Programador' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {miembro.rol}
                        </span>
                      </td>
                      <td className="px-5 py-3 border-r border-gray-100 text-gray-900 font-semibold text-sm">
                        {miembro.nombre}
                      </td>
                      <td className="px-5 py-3 border-r border-gray-100">
                        <span className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded font-mono text-xs border border-gray-200">
                          {miembro.nombre_clave}
                        </span>
                      </td>
                      <td className="px-5 py-3 border-r border-gray-100">
                        {miembro.correo_pgim && miembro.correo_pgim !== '-' ? (
                          <a href={`mailto:${miembro.correo_pgim}`} className="text-blue-600 hover:underline flex items-center gap-1.5 focus:outline-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            {miembro.correo_pgim}
                          </a>
                        ) : (
                          <span className="text-gray-400 italic font-normal">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {miembro.correo_gcorp && miembro.correo_gcorp !== '-' ? (
                          <a href={`mailto:${miembro.correo_gcorp}`} className="text-blue-600 hover:underline flex items-center gap-1.5 focus:outline-none">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            {miembro.correo_gcorp}
                          </a>
                        ) : (
                          <span className="text-gray-400 italic font-normal">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-gray-50 border-t border-gray-200 px-5 py-3">
                <p className="text-xs text-gray-500 font-medium tracking-wide">
                  Total de miembros en el equipo: <span className="text-gray-900 font-bold">{equipo.length}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
