/**
 * @file pendientes/page.js - Panel de control de requerimientos pendientes de correo
 * @description Permite gestionar (Crear, Leer, Actualizar, Eliminar) los requerimientos
 *              recibidos por correo, incluyendo responsables del equipo, historias de Jira,
 *              fechas clave, enlace a Drive con capturas y una línea de tiempo
 *              de la evolución de los asuntos.
 *
 * @route /dashboard/pendientes
 * @requires supabase - Cliente de Supabase
 * @requires lucide-react - Íconos UI
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { 
  Plus, Edit2, Trash2, ExternalLink, Clock, X, Search, Filter, 
  Calendar, User, Link2, AlertCircle, Check, ArrowRight, ChevronDown
} from "lucide-react";

export default function PendientesPage() {
  /* ─── Estados de datos ─── */
  const [pendientes, setPendientes] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ─── Estados de filtros y búsqueda ─── */
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterResponsable, setFilterResponsable] = useState("");

  /* ─── Modales ─── */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedPendiente, setSelectedPendiente] = useState(null);
  
  /* ─── Historial de asuntos ─── */
  const [subjectHistory, setSubjectHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ─── Formulario ─── */
  const [formData, setFormData] = useState({
    asunto: "",
    seguimiento: "",
    responsables: [],
    estado: "Sin atender",
    historias: [],
    fecha_primer_correo: "",
    fecha_atencion: "",
    drive_link: ""
  });
  
  // Entrada temporal para agregar una historia Jira en el formulario
  const [tempHistoria, setTempHistoria] = useState("");

  /* ─── Carga de Datos ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Obtener todos los pendientes
      const { data: pData, error: pError } = await supabase
        .from("pendientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (pError) throw pError;
      setPendientes(pData || []);

      // 2. Obtener miembros del equipo para seleccionar responsables
      const { data: tData, error: tError } = await supabase
        .from("equipo_desarrollo")
        .select("nombre")
        .order("nombre", { ascending: true });

      if (tError) throw tError;
      
      // Eliminar duplicados si los hubiera
      const uniqueNames = Array.from(new Set((tData || []).map(m => m.nombre)));
      setTeamMembers(uniqueNames);
    } catch (err) {
      console.error("Error al cargar datos:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ─── Manejadores de Formulario ─── */
  const openCreateModal = () => {
    setSelectedPendiente(null);
    setFormData({
      asunto: "",
      seguimiento: "",
      responsables: [],
      estado: "Sin atender",
      historias: [],
      fecha_primer_correo: new Date().toISOString().split("T")[0],
      fecha_atencion: "",
      drive_link: ""
    });
    setTempHistoria("");
    setIsFormOpen(true);
  };

  const openEditModal = (pendiente) => {
    setSelectedPendiente(pendiente);
    setFormData({
      asunto: pendiente.asunto || "",
      seguimiento: pendiente.seguimiento || "",
      responsables: pendiente.responsables || [],
      estado: pendiente.estado || "Sin atender",
      historias: pendiente.historias || [],
      fecha_primer_correo: pendiente.fecha_primer_correo || "",
      fecha_atencion: pendiente.fecha_atencion || "",
      drive_link: pendiente.drive_link || ""
    });
    setTempHistoria("");
    setIsFormOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Auto-completar fecha de atención si el estado cambia a Finalizado
    if (name === "estado" && value === "Finalizado" && !formData.fecha_atencion) {
      setFormData(prev => ({
        ...prev,
        estado: value,
        fecha_atencion: new Date().toISOString().split("T")[0]
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxChange = (name) => {
    setFormData(prev => {
      const isSelected = prev.responsables.includes(name);
      const updated = isSelected
        ? prev.responsables.filter(r => r !== name)
        : [...prev.responsables, name];
      return { ...prev, responsables: updated };
    });
  };

  const addHistoria = () => {
    if (!tempHistoria.trim()) return;
    setFormData(prev => ({
      ...prev,
      historias: [...prev.historias, tempHistoria.trim()]
    }));
    setTempHistoria("");
  };

  const removeHistoria = (index) => {
    setFormData(prev => ({
      ...prev,
      historias: prev.historias.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.asunto.trim()) return;

    setSaving(true);
    try {
      if (selectedPendiente) {
        // MODO EDICIÓN
        const isSubjectChanged = formData.asunto.trim() !== selectedPendiente.asunto;

        // 1. Actualizar el pendiente
        const { error: updateError } = await supabase
          .from("pendientes")
          .update({
            asunto: formData.asunto.trim(),
            seguimiento: formData.seguimiento,
            responsables: formData.responsables,
            estado: formData.estado,
            historias: formData.historias,
            fecha_primer_correo: formData.fecha_primer_correo || null,
            fecha_atencion: formData.fecha_atencion || null,
            drive_link: formData.drive_link,
            updated_at: new Date().toISOString()
          })
          .eq("id", selectedPendiente.id);

        if (updateError) throw updateError;

        // 2. Si el asunto cambió, insertar en el historial
        if (isSubjectChanged) {
          const { error: histError } = await supabase
            .from("pendiente_asunto_history")
            .insert({
              pendiente_id: selectedPendiente.id,
              asunto_anterior: selectedPendiente.asunto,
              asunto_nuevo: formData.asunto.trim()
            });

          if (histError) throw histError;
        }

      } else {
        // MODO CREACIÓN
        // 1. Insertar nuevo pendiente
        const { data: newData, error: insertError } = await supabase
          .from("pendientes")
          .insert({
            asunto: formData.asunto.trim(),
            seguimiento: formData.seguimiento,
            responsables: formData.responsables,
            estado: formData.estado,
            historias: formData.historias,
            fecha_primer_correo: formData.fecha_primer_correo || null,
            fecha_atencion: formData.fecha_atencion || null,
            drive_link: formData.drive_link
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // 2. Insertar entrada inicial en el historial
        if (newData) {
          const { error: histError } = await supabase
            .from("pendiente_asunto_history")
            .insert({
              pendiente_id: newData.id,
              asunto_anterior: null,
              asunto_nuevo: formData.asunto.trim()
            });

          if (histError) throw histError;
        }
      }

      setIsFormOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error al guardar pendiente:", err.message);
      alert("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Está seguro de que desea eliminar este pendiente?")) return;

    try {
      const { error } = await supabase
        .from("pendientes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error("Error al eliminar:", err.message);
      alert("Error al eliminar: " + err.message);
    }
  };

  /* ─── Visualización de Línea de Tiempo ─── */
  const openHistoryTimeline = async (pendiente) => {
    setSelectedPendiente(pendiente);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    setSubjectHistory([]);

    try {
      const { data, error } = await supabase
        .from("pendiente_asunto_history")
        .select("*")
        .eq("pendiente_id", pendiente.id)
        .order("changed_at", { ascending: true });

      if (error) throw error;
      setSubjectHistory(data || []);
    } catch (err) {
      console.error("Error al cargar historial:", err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  /* ─── Filtrado ─── */
  const filteredPendientes = pendientes.filter((item) => {
    const matchesSearch = 
      (item.asunto || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.seguimiento || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesEstado = filterEstado ? item.estado === filterEstado : true;
    
    const matchesResponsable = filterResponsable 
      ? (item.responsables || []).includes(filterResponsable)
      : true;

    return matchesSearch && matchesEstado && matchesResponsable;
  });

  /* ─── Estilos de Insignias de Estado ─── */
  const getEstadoBadgeClass = (estado) => {
    switch (estado) {
      case "Sin atender":
        return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700";
      case "En proceso":
        return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50";
      case "Finalizado":
        return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50";
      case "Derivado":
        return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/50";
      case "Esperando respuesta":
        return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50";
      default:
        return "bg-gray-50 text-gray-600 border-gray-200";
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 dark:text-gray-100 transition-colors">
            Control de Pendientes
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">
            Registro, seguimiento e historias asociadas a pendientes de correos recibidos
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-500/15 hover:shadow-lg hover:shadow-orange-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          Registrar Pendiente
        </button>
      </div>

      {/* Buscador e Filtros */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Búsqueda por texto */}
          <div className="relative md:col-span-2">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Search className="h-4.5 w-4.5" />
            </span>
            <input
              type="text"
              placeholder="Buscar en asunto o seguimiento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
            />
          </div>

          {/* Filtro Estado */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Filter className="h-4.5 w-4.5" />
            </span>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none appearance-none transition-all"
            >
              <option value="">Todos los Estados</option>
              <option value="Sin atender">Sin atender</option>
              <option value="En proceso">En proceso</option>
              <option value="Finalizado">Finalizado</option>
              <option value="Derivado">Derivado</option>
              <option value="Esperando respuesta">Esperando respuesta</option>
            </select>
            <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>

          {/* Filtro Responsable */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <User className="h-4.5 w-4.5" />
            </span>
            <select
              value={filterResponsable}
              onChange={(e) => setFilterResponsable(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none appearance-none transition-all"
            >
              <option value="">Todos los Responsables</option>
              {teamMembers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Listado en Tabla */}
      {loading ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 shadow-sm">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : filteredPendientes.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin resultados</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">No se encontraron requerimientos pendientes.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-5 w-16 text-center">ID</th>
                  <th className="py-4 px-5 min-w-[200px]">Asunto (correo)</th>
                  <th className="py-4 px-5 min-w-[220px]">Seguimiento</th>
                  <th className="py-4 px-5">Responsables</th>
                  <th className="py-4 px-5 w-40">Estado</th>
                  <th className="py-4 px-5 min-w-[150px]">Historias</th>
                  <th className="py-4 px-5 w-32 text-center">Primer Correo</th>
                  <th className="py-4 px-5 w-32 text-center">Fecha Atend.</th>
                  <th className="py-4 px-5 w-16 text-center">Drive</th>
                  <th className="py-4 px-5 w-24 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-sm text-gray-700 dark:text-gray-300">
                {filteredPendientes.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                    {/* ID */}
                    <td className="py-4 px-5 text-center font-bold text-gray-400 font-mono">
                      #{item.id}
                    </td>

                    {/* Asunto */}
                    <td className="py-4 px-5 font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-start gap-2 group">
                        <span className="line-clamp-3">{item.asunto}</span>
                        <button
                          onClick={() => openHistoryTimeline(item)}
                          className="p-1 rounded-md text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-all shrink-0 cursor-pointer"
                          title="Ver evolución del asunto (Línea de tiempo)"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                      </div>
                    </td>

                    {/* Seguimiento */}
                    <td className="py-4 px-5 text-gray-500 dark:text-gray-400">
                      <p className="whitespace-pre-line line-clamp-3">
                        {item.seguimiento || <span className="text-gray-350 dark:text-gray-700 italic">Sin comentarios</span>}
                      </p>
                    </td>

                    {/* Responsables */}
                    <td className="py-4 px-5">
                      <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                        {item.responsables && item.responsables.length > 0 ? (
                          item.responsables.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-105 text-gray-800 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700"
                            >
                              {name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-xs italic">No asignado</span>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="py-4 px-5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getEstadoBadgeClass(item.estado)}`}>
                        {item.estado}
                      </span>
                    </td>

                    {/* Historias */}
                    <td className="py-4 px-5">
                      <div className="flex flex-col gap-1 max-w-[180px]">
                        {item.historias && item.historias.length > 0 ? (
                          item.historias.map((link, idx) => {
                            // Extrae la clave de Jira del link si es posible (ej: https://.../browse/PF3-1234 -> PF3-1234)
                            let label = `Link ${idx + 1}`;
                            const match = link.match(/\/browse\/([A-Z0-9]+-[0-9]+)/i);
                            if (match) label = match[1];
                            
                            return (
                              <a
                                key={idx}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium truncate"
                                title={link}
                              >
                                <Link2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{label}</span>
                              </a>
                            );
                          })
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sin historias</span>
                        )}
                      </div>
                    </td>

                    {/* Fecha Primer Correo */}
                    <td className="py-4 px-5 text-center font-mono text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(item.fecha_primer_correo)}
                    </td>

                    {/* Fecha Atención */}
                    <td className="py-4 px-5 text-center font-mono text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(item.fecha_atencion)}
                    </td>

                    {/* Drive Link */}
                    <td className="py-4 px-5 text-center">
                      {item.drive_link ? (
                        <a
                          href={item.drive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex p-1.5 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100 hover:scale-105 transition-all cursor-pointer"
                          title="Abrir captura de Drive"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-800">—</span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
                          title="Editar pendiente"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                          title="Eliminar pendiente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODAL DE FORMULARIO (Crear/Editar) ─── */}
      {isFormOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="flex min-h-full items-start justify-center px-4 py-12">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-3xl flex flex-col animate-fade-in">
            
            {/* Cabecera */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {selectedPendiente ? `Editar Pendiente #${selectedPendiente.id}` : "Registrar Requerimiento Pendiente"}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSave} className="p-6 space-y-6">
              
              {/* Asunto */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Asunto (correo) *
                </label>
                <input
                  type="text"
                  name="asunto"
                  value={formData.asunto}
                  onChange={handleInputChange}
                  required
                  placeholder="Ingrese el asunto del correo..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                />
                {selectedPendiente && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                    Nota: Cambiar este asunto generará un registro histórico para la línea de tiempo.
                  </p>
                )}
              </div>

              {/* Seguimiento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Seguimiento (Comentario de atención)
                </label>
                <textarea
                  name="seguimiento"
                  value={formData.seguimiento}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="Escriba comentarios sobre las acciones que se están realizando..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none resize-none transition-all"
                />
              </div>

              {/* Responsables */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block">
                  Responsables (Personas encargadas)
                </label>
                <div className="bg-gray-55 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800 p-4 max-h-[160px] overflow-y-auto">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No hay miembros cargados en el equipo de desarrollo.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {teamMembers.map((name) => (
                        <label
                          key={name}
                          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={formData.responsables.includes(name)}
                            onChange={() => handleCheckboxChange(name)}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500/20 w-4 h-4"
                          />
                          <span>{name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Estado */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block">
                    Estado
                  </label>
                  <div className="relative">
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none appearance-none transition-all pr-10"
                    >
                      <option value="Sin atender">Sin atender</option>
                      <option value="En proceso">En proceso</option>
                      <option value="Finalizado">Finalizado</option>
                      <option value="Derivado">Derivado</option>
                      <option value="Esperando respuesta">Esperando respuesta</option>
                    </select>
                    <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                {/* Fecha primer correo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block">
                    Fecha del primer correo
                  </label>
                  <input
                    type="date"
                    name="fecha_primer_correo"
                    value={formData.fecha_primer_correo}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  />
                </div>

                {/* Fecha atendido */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block">
                    Fecha de atención
                  </label>
                  <input
                    type="date"
                    name="fecha_atencion"
                    value={formData.fecha_atencion}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Drive Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Enlace de Drive (Captura o Imagen)
                </label>
                <input
                  type="url"
                  name="drive_link"
                  value={formData.drive_link}
                  onChange={handleInputChange}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                />
              </div>

              {/* Historias de Jira (Múltiples) */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider block">
                  Historias de Jira Vinculadas
                </label>
                
                {/* Input de agregado */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://supervisorservicio2020.atlassian.net/browse/PF3-xxxx"
                    value={tempHistoria}
                    onChange={(e) => setTempHistoria(e.target.value)}
                    className="flex-1 px-4 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={addHistoria}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-all cursor-pointer shrink-0"
                  >
                    Añadir Link
                  </button>
                </div>

                {/* Listado de historias en formato Tags */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {formData.historias.length === 0 ? (
                    <span className="text-gray-400 text-xs italic">Ningún link añadido todavía.</span>
                  ) : (
                    formData.historias.map((link, index) => (
                      <div
                        key={index}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/30"
                      >
                        <span className="max-w-[220px] truncate font-medium">{link}</span>
                        <button
                          type="button"
                          onClick={() => removeHistoria(index)}
                          className="text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 transition-colors p-0.5 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </form>

            {/* Acciones */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:ring-4 focus:ring-orange-500/20 transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center gap-2 justify-center cursor-pointer"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </button>
            </div>

          </div>
          </div>
        </div>,
      document.body)}

      {/* ─── MODAL DE LÍNEA DE TIEMPO (Historial de Asunto) ─── */}
      {isHistoryOpen && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="flex min-h-full items-start justify-center px-4 py-12">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-2xl flex flex-col animate-fade-in">
            
            {/* Cabecera */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Evolución del Asunto
                {selectedPendiente && (
                  <span className="text-gray-400 font-mono text-xs font-normal">
                    (Pendiente #{selectedPendiente.id})
                  </span>
                )}
              </h3>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido (Timeline) */}
            <div className="p-6">
              {historyLoading ? (
                <div className="space-y-4 py-8">
                  <div className="skeleton h-10 w-full" />
                  <div className="skeleton h-10 w-full" />
                  <div className="skeleton h-10 w-full" />
                </div>
              ) : subjectHistory.length === 0 ? (
                <div className="text-center py-10">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No hay registros de evolución para este requerimiento.</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-orange-300 dark:border-orange-800 ml-4 py-2 space-y-8">
                  {subjectHistory.map((hist, index) => {
                    const dateObj = new Date(hist.changed_at);
                    const formattedDateTime = dateObj.toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    });

                    const isFirst = index === 0;

                    return (
                      <div key={hist.id} className="relative">
                        {/* Nodo de la línea de tiempo alineado perfectamente en el centro (-left-[7px] para w-4 y border-l-2) */}
                        <span className="absolute -left-[7px] top-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-white dark:bg-gray-900 border-2 border-orange-500">
                          {isFirst ? (
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          ) : (
                            <Check className="w-2.5 h-2.5 text-orange-500 font-bold" />
                          )}
                        </span>

                        <div className="space-y-1">
                          {/* Fecha */}
                          <p className="text-xs font-semibold font-mono text-gray-400 dark:text-gray-500">
                            {formattedDateTime} {isFirst && <span className="text-orange-500 font-sans ml-1 text-[10px] uppercase tracking-wider font-bold">Asunto Inicial</span>}
                          </p>

                          {/* Contenido */}
                          <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/80 rounded-xl p-3 shadow-sm">
                            {!isFirst && hist.asunto_anterior && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 line-through decoration-red-400/50">
                                {hist.asunto_anterior}
                              </div>
                            )}
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {!isFirst && hist.asunto_anterior && (
                                <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <span>{hist.asunto_nuevo}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cerrar */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex justify-end">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
          </div>
        </div>,
      document.body)}

    </div>
  );
}
