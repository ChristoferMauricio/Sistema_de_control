"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/app/dashboard/RoleContext";

// ─── Constants ──────────────────────────────────────────────
const MODULO_OPTIONS = [
    "Fiscalización",
    "Proyecto Desacoplamiento",
    "PAS",
    "Microservicios",
    "Errores Materiales",
    "Eventos no Deseados",
    "Medidas Administrativas",
];

const PRIORIDAD_OPTIONS = ["1.Baja", "2.Media", "3.Alta"];

const ESTADO_CLIENTE = [
    "1.Tentativa",
    "2.Enviar correo",
    "3.Correo enviado",
    "4.Respuesta pendiente",
    "5.Reunión programada",
    "Cancelada",
    "Reprogramada",
    "Realizada",
];

const ESTADO_INTERNA = [
    "1.Tentativa",
    "2.Reunión programada",
    "Cancelada",
    "Reprogramada",
    "Realizada",
];

const PAGE_SIZE = 10;

function getEstadoColor(estado) {
    if (!estado) return { bg: "bg-gray-50", text: "text-gray-600" };
    const s = estado.toLowerCase();
    if (s.includes("realizada")) return { bg: "bg-green-50", text: "text-green-700" };
    if (s.includes("programada")) return { bg: "bg-blue-50", text: "text-blue-700" };
    if (s.includes("cancelada")) return { bg: "bg-red-50", text: "text-red-600" };
    if (s.includes("reprogramada")) return { bg: "bg-amber-50", text: "text-amber-700" };
    if (s.includes("correo")) return { bg: "bg-purple-50", text: "text-purple-600" };
    if (s.includes("pendiente")) return { bg: "bg-orange-50", text: "text-orange-600" };
    if (s.includes("tentativa")) return { bg: "bg-gray-100", text: "text-gray-600" };
    return { bg: "bg-gray-50", text: "text-gray-600" };
}

function getPrioridadColor(p) {
    if (!p) return { bg: "bg-gray-50", text: "text-gray-500" };
    if (p.includes("Alta")) return { bg: "bg-red-50", text: "text-red-600" };
    if (p.includes("Media")) return { bg: "bg-amber-50", text: "text-amber-600" };
    return { bg: "bg-green-50", text: "text-green-600" };
}

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ─── Calendar Component ─────────────────────────────────────
function MeetingCalendar({ reuniones }) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [showTentativas, setShowTentativas] = useState(false);

    // Filter to only scheduled meetings that have a fecha_programada
    const scheduled = useMemo(() => {
        return reuniones.filter((r) => {
            if (!r.fecha_programada) return false;
            const e = (r.estado || "").toLowerCase();
            return e.includes("programada") || e.includes("realizada");
        });
    }, [reuniones]);

    // Tentative meetings (use fechas_propuestas)
    const tentativas = useMemo(() => {
        return reuniones.filter((r) => {
            const e = (r.estado || "").toLowerCase();
            return e.includes("tentativa");
        });
    }, [reuniones]);

    // Build events map: dateStr -> events[]
    const eventsMap = useMemo(() => {
        const map = {};
        scheduled.forEach((r) => {
            const dateStr = r.fecha_programada.split(" ")[0];
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push({ ...r, _tentativa: false });
        });
        if (showTentativas) {
            tentativas.forEach((r) => {
                const propuestas = r.fechas_propuestas || [];
                propuestas.forEach((fp) => {
                    if (fp.fecha) {
                        if (!map[fp.fecha]) map[fp.fecha] = [];
                        map[fp.fecha].push({ ...r, _tentativa: true, _hora: fp.hora || "" });
                    }
                });
            });
        }
        return map;
    }, [scheduled, tentativas, showTentativas]);

    // Build calendar grid
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Monday=0 ... Sunday=6
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const cells = [];
    // Padding for first week
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(year - 1); }
        else setMonth(month - 1);
    }
    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(year + 1); }
        else setMonth(month + 1);
    }
    function goToday() { setMonth(today.getMonth()); setYear(today.getFullYear()); }

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-gray-900 text-lg">
                        {MONTHS_ES[month]} {year}
                    </h2>
                    <button onClick={goToday}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors">
                        Hoy
                    </button>
                    <button onClick={() => setShowTentativas(!showTentativas)}
                        title={showTentativas ? "Ocultar tentativas" : "Mostrar tentativas"}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                            ${showTentativas ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
                        {showTentativas ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                        )}
                        Tentativas
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={prevMonth}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button onClick={nextMonth}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-blue-500" />
                    <span className="text-xs text-gray-500">Reunión con cliente</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                    <span className="text-xs text-gray-500">Reunión Interna</span>
                </div>
                {showTentativas && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2 border-dashed border-amber-400 bg-amber-50" />
                        <span className="text-xs text-gray-500">Tentativa</span>
                    </div>
                )}
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
                {DAYS_ES.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-1.5">{d}</div>
                ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
                {cells.map((day, i) => {
                    if (day === null) {
                        return <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[80px]" />;
                    }
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const events = eventsMap[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isWeekend = (startDay + day - 1) % 7 >= 5;

                    return (
                        <div key={dateStr}
                            className={`min-h-[80px] p-1.5 ${isWeekend ? "bg-gray-50" : "bg-white"} transition-colors`}>
                            <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                                ${isToday ? "bg-orange-500 text-white" : "text-gray-700"}`}>
                                {day}
                            </div>
                            <div className="space-y-0.5">
                                {events.slice(0, 3).map((ev, evIdx) => {
                                    const isCliente = ev.tipo === "Reunión con cliente";
                                    const isTent = ev._tentativa;
                                    const hora = isTent ? (ev._hora || "") : (ev.fecha_programada?.split(" ")[1] || "");
                                    return (
                                        <div key={`${ev.id}-${evIdx}`}
                                            title={`${isTent ? "[TENTATIVA] " : ""}${ev.tipo}\n${ev.modulo || ""}\n${ev.tema || ""}\n${hora ? "Hora: " + hora : ""}`}
                                            className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-default
                                                ${isTent
                                                    ? "border border-dashed border-amber-300 bg-amber-50/60 text-amber-700 opacity-80"
                                                    : isCliente ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                                                }`}>
                                            {hora && <span className="font-semibold">{hora} </span>}
                                            {ev.modulo || ev.tema || ev.tipo}
                                        </div>
                                    );
                                })}
                                {events.length > 3 && (
                                    <div className="text-[10px] text-gray-400 px-1">+{events.length - 3} más</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Confirm Delete ─────────────────────────────────────────
function ConfirmDeleteModal({ onConfirm, onCancel }) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
                <h3 className="font-semibold text-gray-900 text-lg mb-2">¿Eliminar reunión?</h3>
                <p className="text-gray-500 text-sm mb-5">Esta acción no se puede deshacer.</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} className="px-5 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 shadow-md transition-all">
                        Eliminar
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Edit / New Modal ───────────────────────────────────────
function EditModal({ row, sprints, nombres, onSave, onClose, isNew }) {
    const [form, setForm] = useState({
        ...row,
        fechas_propuestas: row.fechas_propuestas || [],
        presentes: row.presentes || [],
    });
    const [customModulo, setCustomModulo] = useState(
        row.modulo && !MODULO_OPTIONS.includes(row.modulo) ? row.modulo : ""
    );
    const [useCustomModulo, setUseCustomModulo] = useState(
        row.modulo && !MODULO_OPTIONS.includes(row.modulo)
    );
    const [saving, setSaving] = useState(false);

    function updateField(field, value) {
        setForm((f) => {
            const updated = { ...f, [field]: value };
            // When tipo changes, reset estado
            if (field === "tipo") {
                updated.estado = "1.Tentativa";
                updated.fecha_programada = "";
            }
            return updated;
        });
    }

    const estadoOptions = form.tipo === "Reunión con cliente" ? ESTADO_CLIENTE : ESTADO_INTERNA;

    // Determine when multi-date is allowed vs locked
    const isClienteProposal =
        form.tipo === "Reunión con cliente" &&
        ["1.Tentativa", "2.Enviar correo", "3.Correo enviado", "4.Respuesta pendiente"].includes(form.estado);
    const isInternaProposal =
        form.tipo !== "Reunión con cliente" &&
        ["1.Tentativa", "Reprogramada"].includes(form.estado);
    const canAddDates = isClienteProposal || isInternaProposal;

    const isClienteConfirm =
        form.tipo === "Reunión con cliente" && form.estado === "5.Reunión programada";
    const isInternaConfirm =
        form.tipo !== "Reunión con cliente" && form.estado === "2.Reunión programada";
    const showDatePicker = isClienteConfirm || isInternaConfirm;

    function addProposedDate() {
        updateField("fechas_propuestas", [
            ...form.fechas_propuestas,
            { fecha: "", hora: "" },
        ]);
    }

    function removeProposedDate(idx) {
        updateField(
            "fechas_propuestas",
            form.fechas_propuestas.filter((_, i) => i !== idx)
        );
    }

    function updateProposedDate(idx, field, value) {
        const updated = form.fechas_propuestas.map((d, i) =>
            i === idx ? { ...d, [field]: value } : d
        );
        updateField("fechas_propuestas", updated);
    }

    function togglePresente(name) {
        const current = form.presentes || [];
        if (current.includes(name)) {
            updateField("presentes", current.filter((n) => n !== name));
        } else {
            updateField("presentes", [...current, name]);
        }
    }

    async function handleSave() {
        setSaving(true);
        const finalModulo = useCustomModulo ? customModulo : form.modulo;
        await onSave({ ...form, modulo: finalModulo });
        setSaving(false);
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => {
                if (window.confirm("¿Salir sin guardar?")) onClose();
            }} />
            <div
                className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[calc(100vh-3rem)] flex flex-col animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h3 className="font-semibold text-gray-900 text-lg">
                        {isNew ? "Nueva Reunión" : `Editar Reunión #${row.id}`}
                    </h3>
                    <button onClick={() => { if (window.confirm("¿Salir sin guardar?")) onClose(); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form body */}
                <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">

                    {/* Row 1: Sprint, Tipo, Módulo */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sprint</label>
                            <select value={form.sprint || ""} onChange={(e) => updateField("sprint", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                                <option value="">Seleccionar...</option>
                                {sprints.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                            <select value={form.tipo || "Reunión Interna"} onChange={(e) => updateField("tipo", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                                <option value="Reunión Interna">Reunión Interna</option>
                                <option value="Reunión con cliente">Reunión con cliente</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Módulo</label>
                            {useCustomModulo ? (
                                <div className="flex gap-2">
                                    <input type="text" value={customModulo} onChange={(e) => setCustomModulo(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Escribir módulo..." />
                                    <button onClick={() => { setUseCustomModulo(false); setCustomModulo(""); }}
                                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">✕</button>
                                </div>
                            ) : (
                                <select value={form.modulo || ""} onChange={(e) => {
                                    if (e.target.value === "__custom__") { setUseCustomModulo(true); }
                                    else updateField("modulo", e.target.value);
                                }}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                                    <option value="">Seleccionar...</option>
                                    {MODULO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                                    <option value="__custom__">— Otro (escribir) —</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Row 2: Tema */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Tema u Objetivo</label>
                        <textarea value={form.tema || ""} onChange={(e) => updateField("tema", e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-y"
                            placeholder="Describe el objetivo de la reunión..." />
                    </div>

                    {/* Row 3: Estado + Prioridad */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                            <select value={form.estado || "1.Tentativa"} onChange={(e) => updateField("estado", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                                {estadoOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Prioridad</label>
                            <select value={form.prioridad || "2.Media"} onChange={(e) => updateField("prioridad", e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                                {PRIORIDAD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Row 4: Fechas propuestas */}
                    {canAddDates && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Fechas propuestas</label>
                            <div className="space-y-2">
                                {form.fechas_propuestas.map((fp, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input type="date" value={fp.fecha || ""} onChange={(e) => updateProposedDate(idx, "fecha", e.target.value)}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" />
                                        <input type="time" value={fp.hora || ""} onChange={(e) => updateProposedDate(idx, "hora", e.target.value)}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" />
                                        <button onClick={() => removeProposedDate(idx)}
                                            className="p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                <button onClick={addProposedDate}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Agregar fecha
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Row 5: Select confirmed date (when status = "Reunión programada") */}
                    {showDatePicker && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Fecha programada (confirmar)</label>
                            <div className="space-y-2">
                                {form.fechas_propuestas.filter((fp) => fp.fecha).map((fp, idx) => {
                                    const val = `${fp.fecha} ${fp.hora || ""}`.trim();
                                    return (
                                        <label key={idx} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.fecha_programada === val ? "bg-blue-50 border-blue-300" : "border-gray-200 hover:bg-gray-50"}`}>
                                            <input type="radio" name="fecha_confirmada" value={val} checked={form.fecha_programada === val}
                                                onChange={() => updateField("fecha_programada", val)}
                                                className="accent-orange-500" />
                                            <span className="text-sm text-gray-700">{fp.fecha} {fp.hora && `a las ${fp.hora}`}</span>
                                        </label>
                                    );
                                })}
                                {/* Custom date option */}
                                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.fecha_programada && !form.fechas_propuestas.some((fp) => `${fp.fecha} ${fp.hora || ""}`.trim() === form.fecha_programada) ? "bg-blue-50 border-blue-300" : "border-gray-200 hover:bg-gray-50"}`}>
                                    <input type="radio" name="fecha_confirmada" value="__custom__" checked={form.fecha_programada && !form.fechas_propuestas.some((fp) => `${fp.fecha} ${fp.hora || ""}`.trim() === form.fecha_programada)}
                                        onChange={() => updateField("fecha_programada", "__custom__")}
                                        className="accent-orange-500" />
                                    <span className="text-sm text-gray-500">Otra fecha</span>
                                </label>
                                {form.fecha_programada && !form.fechas_propuestas.some((fp) => `${fp.fecha} ${fp.hora || ""}`.trim() === form.fecha_programada) && (
                                    <div className="flex items-center gap-2 ml-7">
                                        <input type="date" value={form._customDate || ""} onChange={(e) => {
                                            setForm((f) => ({ ...f, _customDate: e.target.value, fecha_programada: `${e.target.value} ${f._customTime || ""}`.trim() }));
                                        }}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" />
                                        <input type="time" value={form._customTime || ""} onChange={(e) => {
                                            setForm((f) => ({ ...f, _customTime: e.target.value, fecha_programada: `${f._customDate || ""} ${e.target.value}`.trim() }));
                                        }}
                                            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Show confirmed date for other statuses */}
                    {!canAddDates && !showDatePicker && form.fecha_programada && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Fecha programada</label>
                            <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
                                {form.fecha_programada}
                            </div>
                        </div>
                    )}

                    {/* Row 6: Presentes (multi-select) */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Presentes</label>
                        <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50/50 min-h-[44px]">
                            {nombres.map((n) => {
                                const name = n.Nombre;
                                const selected = (form.presentes || []).includes(name);
                                return (
                                    <button key={name} type="button" onClick={() => togglePresente(name)}
                                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selected
                                            ? "bg-orange-500 text-white shadow-sm"
                                            : "bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600"
                                            }`}>
                                        {name}
                                        {selected && (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                            {nombres.length === 0 && <span className="text-xs text-gray-400">No hay nombres disponibles</span>}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                    <button onClick={() => { if (window.confirm("¿Salir sin guardar?")) onClose(); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-500/15 transition-all disabled:opacity-50 disabled:cursor-wait">
                        {saving ? "Guardando..." : (isNew ? "Crear" : "Guardar cambios")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Main Table ─────────────────────────────────────────────
export default function ReunionesTable({ reuniones = [], sprints = [], nombres = [], onRefresh }) {
    const role = useRole();
    const [search, setSearch] = useState("");
    const [editRow, setEditRow] = useState(null);
    const [deleteId, setDeleteId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [filterSprint, setFilterSprint] = useState("");
    const [filterTipo, setFilterTipo] = useState("");

    const filtered = useMemo(() => {
        let result = reuniones;
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter((r) =>
                r.tema?.toLowerCase().includes(q) ||
                r.modulo?.toLowerCase().includes(q) ||
                r.sprint?.toLowerCase().includes(q)
            );
        }
        if (filterSprint) result = result.filter((r) => r.sprint === filterSprint);
        if (filterTipo) result = result.filter((r) => r.tipo === filterTipo);
        return result;
    }, [reuniones, search, filterSprint, filterTipo]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const uniqueSprints = useMemo(() => [...new Set(reuniones.map((r) => r.sprint).filter(Boolean))].sort(), [reuniones]);

    async function handleSave(data) {
        const { id, _customDate, _customTime, ...rest } = data;
        if (id) {
            await supabase.from("reuniones").update(rest).eq("id", id);
        } else {
            await supabase.from("reuniones").insert(rest);
        }
        setEditRow(null);
        onRefresh?.();
    }

    async function handleDelete(id) {
        await supabase.from("reuniones").delete().eq("id", id);
        setDeleteId(null);
        onRefresh?.();
    }

    function openNew() {
        setEditRow({
            sprint: "",
            tipo: "Reunión Interna",
            modulo: "",
            tema: "",
            estado: "1.Tentativa",
            fechas_propuestas: [],
            fecha_programada: "",
            presentes: [],
            prioridad: "2.Media",
        });
    }

    return (
        <div>
            {/* Calendar view */}
            <MeetingCalendar reuniones={reuniones} />

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <h2 className="font-semibold text-gray-900">Reuniones</h2>
                        <span className="text-xs text-gray-400">{filtered.length} registros</span>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Sprint filter */}
                        <select value={filterSprint} onChange={(e) => { setFilterSprint(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                            <option value="">Sprint: Todos</option>
                            {[...sprints, ...uniqueSprints].filter((v, i, a) => a.indexOf(v) === i).sort().map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>

                        {/* Tipo filter */}
                        <select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                            <option value="">Tipo: Todos</option>
                            <option value="Reunión Interna">Reunión Interna</option>
                            <option value="Reunión con cliente">Reunión con cliente</option>
                        </select>

                        {/* Search */}
                        <div className="relative">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                                placeholder="Buscar..."
                                className="pl-9 pr-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40 w-48" />
                        </div>

                        {/* New button */}
                        {role !== "viewer" && (
                            <button onClick={openNew}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-500/15 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Nueva Reunión
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500 bg-gray-50/50">
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">#</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Sprint</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tipo</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Módulo</th>
                                <th className="text-left px-4 py-3 font-medium" style={{ minWidth: "200px" }}>Tema</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Estado</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Fecha</th>
                                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Presentes</th>
                                <th className="text-center px-4 py-3 font-medium whitespace-nowrap">Prioridad</th>
                                {role !== "viewer" && <th className="text-center px-4 py-3 font-medium whitespace-nowrap w-20">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">
                                        No hay reuniones registradas
                                    </td>
                                </tr>
                            ) : (
                                paginated.map((r) => {
                                    const ec = getEstadoColor(r.estado);
                                    const pc = getPrioridadColor(r.prioridad);
                                    const presentes = r.presentes || [];
                                    return (
                                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 text-gray-400 text-xs font-mono">{r.id}</td>
                                            <td className="px-4 py-3">
                                                {r.sprint ? (
                                                    <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">{r.sprint}</span>
                                                ) : <span className="text-gray-300 text-xs">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded-md whitespace-nowrap ${r.tipo === "Reunión con cliente" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                                                    {r.tipo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-700">{r.modulo || "—"}</td>
                                            <td className="px-4 py-3 text-xs text-gray-700 max-w-[250px] truncate" title={r.tema}>{r.tema || "—"}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${ec.bg} ${ec.text}`}>
                                                    {r.estado}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                                                {r.fecha_programada || (r.fechas_propuestas?.length ? `${r.fechas_propuestas.length} propuesta(s)` : "—")}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {presentes.length > 0 ? presentes.map((p) => (
                                                        <span key={p} className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">{p}</span>
                                                    )) : <span className="text-gray-300 text-xs">—</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${pc.bg} ${pc.text}`}>
                                                    {r.prioridad || "—"}
                                                </span>
                                            </td>
                                            {role !== "viewer" && (
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => setEditRow(r)} title="Editar"
                                                            className="p-1.5 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button onClick={() => setDeleteId(r.id)} title="Eliminar"
                                                            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Página {currentPage} de {totalPages}
                        </span>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                                ← Anterior
                            </button>
                            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}

                {/* Modals */}
                {editRow && (
                    <EditModal
                        row={editRow}
                        sprints={sprints}
                        nombres={nombres}
                        onSave={handleSave}
                        onClose={() => setEditRow(null)}
                        isNew={!editRow.id}
                    />
                )}
                {deleteId && (
                    <ConfirmDeleteModal
                        onConfirm={() => handleDelete(deleteId)}
                        onCancel={() => setDeleteId(null)}
                    />
                )}
            </div>
        </div>
    );
}
