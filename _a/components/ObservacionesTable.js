"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";

const MODULO_OPTIONS = ["Mod. Maestros", "Mod. PAS", "Mod. Fiscalización"];
const AMBIENTE_OPTIONS = ["Desarrollo", "Certificación", "Producción"];
const ESTADO_OPTIONS = ["Registro", "En Revisión", "Resuelto"];

const EMPTY_ROW = {
  sprint: "",
  modulo: "",
  submodulo: "",
  descripcion: "",
  obs_word_link: "",
  ambiente: "",
  quien_detecto: "",
  quien_corrigio: "",
  estado: "Registro",
  observacion_final: "",
  solucion_word_link: "",
};

function formatDateDDMM(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calcDays(fechaRegistro, fechaModificacion) {
  if (!fechaRegistro || !fechaModificacion) return "—";
  const a = new Date(fechaRegistro);
  const b = new Date(fechaModificacion);
  const diff = Math.floor((b - a) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : "—";
}

function shortenUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const path = u.pathname.length > 20 ? u.pathname.slice(0, 20) + "…" : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
  }
}

// ─── Markdown Preview Modal ─────────────────────────────────
function MarkdownModal({ content, title, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title || "Vista Previa"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-orange-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "*Sin contenido*"}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Row Modal ─────────────────────────────────────────
function EditModal({ row, nombres, onSave, onClose, isNew }) {
  const [form, setForm] = useState({ ...row });
  const [customModulo, setCustomModulo] = useState(
    row.modulo && !MODULO_OPTIONS.includes(row.modulo) ? row.modulo : ""
  );
  const [useCustomModulo, setUseCustomModulo] = useState(
    row.modulo && !MODULO_OPTIONS.includes(row.modulo)
  );
  const [mdPreview, setMdPreview] = useState(null); // "descripcion" | "observacion_final"
  const [saving, setSaving] = useState(false);

  function updateField(field, value) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // Auto-set fecha_modificacion when estado changes
      if (field === "estado" && value !== f.estado) {
        updated.fecha_modificacion = new Date().toISOString().split("T")[0];
      }
      return updated;
    });
  }

  async function handleSave() {
    setSaving(true);
    const finalModulo = useCustomModulo ? customModulo : form.modulo;
    await onSave({ ...form, modulo: finalModulo });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-lg">
            {isNew ? "Nueva Observación" : `Editar #${row.id}`}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {/* Row 1: Sprint + Módulo + Submódulo */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Sprint</label>
              <input type="text" value={form.sprint || ""} onChange={(e) => updateField("sprint", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Ej: Sprint 12" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Módulo</label>
              {useCustomModulo ? (
                <div className="flex gap-1">
                  <input type="text" value={customModulo} onChange={(e) => setCustomModulo(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Módulo personalizado" />
                  <button onClick={() => { setUseCustomModulo(false); setCustomModulo(""); }}
                    className="px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-xs">✕</button>
                </div>
              ) : (
                <select value={form.modulo || ""} onChange={(e) => {
                  if (e.target.value === "__custom__") { setUseCustomModulo(true); }
                  else updateField("modulo", e.target.value);
                }} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                  <option value="">Seleccionar...</option>
                  {MODULO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__custom__">✏️ Otro...</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Submódulo</label>
              <input type="text" value={form.submodulo || ""} onChange={(e) => updateField("submodulo", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Ej: Listado" />
            </div>
          </div>

          {/* Descripción (Markdown) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Descripción de la observación (Markdown)</label>
              <button onClick={() => setMdPreview("descripcion")}
                className="text-[11px] text-orange-500 hover:text-orange-600 font-medium">Vista previa ↗</button>
            </div>
            <textarea value={form.descripcion || ""} onChange={(e) => updateField("descripcion", e.target.value)}
              rows={4} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-y"
              placeholder="Escribe en formato Markdown..." />
          </div>

          {/* Row 2: Obs WORD + Ambiente */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Obs WORD (Link)</label>
              <input type="url" value={form.obs_word_link || ""} onChange={(e) => updateField("obs_word_link", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ambiente</label>
              <select value={form.ambiente || ""} onChange={(e) => updateField("ambiente", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                <option value="">Seleccionar...</option>
                {AMBIENTE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Row 3: Quién detectó + Quién corrigió */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">¿Quién lo detectó?</label>
              <select value={form.quien_detecto || ""} onChange={(e) => updateField("quien_detecto", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                <option value="">Seleccionar...</option>
                {nombres.map((n) => <option key={n.id} value={n.Nombre}>{n.Nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">¿Quién lo corrigió?</label>
              <select value={form.quien_corrigio || ""} onChange={(e) => updateField("quien_corrigio", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                <option value="">Seleccionar...</option>
                {nombres.map((n) => <option key={n.id} value={n.Nombre}>{n.Nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Row 4: Estado */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
              <select value={form.estado || "Registro"} onChange={(e) => updateField("estado", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                {ESTADO_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha registro</label>
              <input type="text" readOnly value={formatDateDDMM(form.fecha_registro)}
                className="w-full px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-sm text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha modificación</label>
              <input type="text" readOnly value={formatDateDDMM(form.fecha_modificacion)}
                className="w-full px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-sm text-gray-500" />
            </div>
          </div>

          {/* Observación Final (Markdown) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Observación Final (Markdown)</label>
              <button onClick={() => setMdPreview("observacion_final")}
                className="text-[11px] text-orange-500 hover:text-orange-600 font-medium">Vista previa ↗</button>
            </div>
            <textarea value={form.observacion_final || ""} onChange={(e) => updateField("observacion_final", e.target.value)}
              rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-y"
              placeholder="Observación final en Markdown..." />
          </div>

          {/* Solución WORD */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Solución WORD (Link)</label>
            <input type="url" value={form.solucion_word_link || ""} onChange={(e) => updateField("solucion_word_link", e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="https://..." />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-500/15 transition-all disabled:opacity-50 disabled:cursor-wait">
            {saving ? "Guardando..." : (isNew ? "Crear" : "Guardar cambios")}
          </button>
        </div>
      </div>

      {/* Markdown preview nested modal */}
      {mdPreview && (
        <MarkdownModal
          content={mdPreview === "descripcion" ? form.descripcion : form.observacion_final}
          title={mdPreview === "descripcion" ? "Descripción" : "Observación Final"}
          onClose={() => setMdPreview(null)}
        />
      )}
    </div>
  );
}

// ─── Main Table ─────────────────────────────────────────────
export default function ObservacionesTable({ observaciones = [], nombres = [], onRefresh }) {
  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [mdModal, setMdModal] = useState(null); // { content, title }
  const [deleting, setDeleting] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return observaciones;
    const q = search.toLowerCase();
    return observaciones.filter((o) =>
      o.sprint?.toLowerCase().includes(q) ||
      o.modulo?.toLowerCase().includes(q) ||
      o.submodulo?.toLowerCase().includes(q) ||
      o.descripcion?.toLowerCase().includes(q) ||
      o.quien_detecto?.toLowerCase().includes(q) ||
      o.quien_corrigio?.toLowerCase().includes(q) ||
      o.estado?.toLowerCase().includes(q)
    );
  }, [observaciones, search]);

  async function handleSave(data) {
    const record = {
      sprint: data.sprint || null,
      modulo: data.modulo || null,
      submodulo: data.submodulo || null,
      descripcion: data.descripcion || null,
      obs_word_link: data.obs_word_link || null,
      ambiente: data.ambiente || null,
      quien_detecto: data.quien_detecto || null,
      quien_corrigio: data.quien_corrigio || null,
      estado: data.estado || "Registro",
      fecha_modificacion: data.fecha_modificacion || null,
      observacion_final: data.observacion_final || null,
      solucion_word_link: data.solucion_word_link || null,
      updated_at: new Date().toISOString(),
    };

    if (isNew) {
      record.fecha_registro = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("observaciones").insert([record]);
      if (error) { alert("Error al crear: " + error.message); return; }
    } else {
      const { error } = await supabase.from("observaciones").update(record).eq("id", data.id);
      if (error) { alert("Error al actualizar: " + error.message); return; }
    }

    setEditRow(null);
    setIsNew(false);
    onRefresh();
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar esta observación?")) return;
    setDeleting(id);
    const { error } = await supabase.from("observaciones").delete().eq("id", id);
    if (error) alert("Error al eliminar: " + error.message);
    else onRefresh();
    setDeleting(null);
  }

  function getEstadoStyle(estado) {
    switch (estado) {
      case "Registro": return "bg-blue-50 text-blue-700";
      case "En Revisión": return "bg-amber-50 text-amber-700";
      case "Resuelto": return "bg-green-50 text-green-700";
      default: return "bg-gray-100 text-gray-600";
    }
  }

  function getAmbienteStyle(ambiente) {
    switch (ambiente) {
      case "Desarrollo": return "bg-sky-50 text-sky-700";
      case "Certificación": return "bg-purple-50 text-purple-700";
      case "Producción": return "bg-red-50 text-red-700";
      default: return "bg-gray-100 text-gray-600";
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-gray-900">
              Registro de Observaciones
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {filtered.length} observaci{filtered.length !== 1 ? "ones" : "ón"} encontrada{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditRow({ ...EMPTY_ROW, fecha_registro: new Date().toISOString().split("T")[0] }); setIsNew(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-500/15 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nueva Observación
            </button>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..." className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40 w-full sm:w-56" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1500px" }}>
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium w-12">#</th>
                <th className="text-left px-4 py-3 font-medium">Sprint</th>
                <th className="text-left px-4 py-3 font-medium">Módulo</th>
                <th className="text-left px-4 py-3 font-medium">Submódulo</th>
                <th className="text-left px-4 py-3 font-medium" style={{ minWidth: "160px" }}>Descripción</th>
                <th className="text-left px-4 py-3 font-medium">Obs WORD</th>
                <th className="text-left px-4 py-3 font-medium">Ambiente</th>
                <th className="text-left px-4 py-3 font-medium">Detectó</th>
                <th className="text-left px-4 py-3 font-medium">Registro</th>
                <th className="text-left px-4 py-3 font-medium">Corrigió</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">F. Modif.</th>
                <th className="text-center px-4 py-3 font-medium">Días</th>
                <th className="text-left px-4 py-3 font-medium" style={{ minWidth: "140px" }}>Obs. Final</th>
                <th className="text-left px-4 py-3 font-medium">Sol. WORD</th>
                <th className="text-center px-4 py-3 font-medium w-20">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>No hay observaciones registradas</p>
                      <button onClick={() => { setEditRow({ ...EMPTY_ROW, fecha_registro: new Date().toISOString().split("T")[0] }); setIsNew(true); }}
                        className="text-orange-500 hover:text-orange-600 text-xs font-medium mt-1">
                        + Crear la primera
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((obs) => (
                  <tr key={obs.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{obs.id}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{obs.sprint || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {obs.modulo ? (
                        <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 font-medium">{obs.modulo}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{obs.submodulo || "—"}</td>
                    {/* Descripción — click to preview markdown */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setMdModal({ content: obs.descripcion, title: `Descripción #${obs.id}` })}
                        className="text-left text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer max-w-[180px] truncate block"
                        title="Click para ver completo"
                      >
                        {obs.descripcion ? obs.descripcion.slice(0, 40) + (obs.descripcion.length > 40 ? "…" : "") : "—"}
                      </button>
                    </td>
                    {/* Obs WORD link */}
                    <td className="px-4 py-3">
                      {obs.obs_word_link ? (
                        <a href={obs.obs_word_link} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 underline max-w-[120px] truncate block" title={obs.obs_word_link}>
                          {shortenUrl(obs.obs_word_link)}
                        </a>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {obs.ambiente ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getAmbienteStyle(obs.ambiente)}`}>{obs.ambiente}</span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{obs.quien_detecto || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDateDDMM(obs.fecha_registro)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{obs.quien_corrigio || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getEstadoStyle(obs.estado)}`}>
                        {obs.estado || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDateDDMM(obs.fecha_modificacion)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-bold text-gray-700">
                        {calcDays(obs.fecha_registro, obs.fecha_modificacion)}
                      </span>
                    </td>
                    {/* Observación Final — click to preview */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setMdModal({ content: obs.observacion_final, title: `Obs. Final #${obs.id}` })}
                        className="text-left text-xs text-gray-600 hover:text-orange-600 transition-colors cursor-pointer max-w-[140px] truncate block"
                        title="Click para ver completo"
                      >
                        {obs.observacion_final ? obs.observacion_final.slice(0, 30) + (obs.observacion_final.length > 30 ? "…" : "") : "—"}
                      </button>
                    </td>
                    {/* Solución WORD link */}
                    <td className="px-4 py-3">
                      {obs.solucion_word_link ? (
                        <a href={obs.solucion_word_link} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 underline max-w-[120px] truncate block" title={obs.solucion_word_link}>
                          {shortenUrl(obs.solucion_word_link)}
                        </a>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setEditRow(obs); setIsNew(false); }}
                          className="p-1.5 rounded-lg hover:bg-orange-50 text-gray-400 hover:text-orange-600 transition-colors" title="Editar">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(obs.id)} disabled={deleting === obs.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-30" title="Eliminar">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {editRow && (
        <EditModal
          row={editRow}
          nombres={nombres}
          isNew={isNew}
          onSave={handleSave}
          onClose={() => { setEditRow(null); setIsNew(false); }}
        />
      )}

      {/* Markdown Preview Modal */}
      {mdModal && (
        <MarkdownModal
          content={mdModal.content}
          title={mdModal.title}
          onClose={() => setMdModal(null)}
        />
      )}
    </>
  );
}
