/**
 * @file ReunionesTable.js
 * @description Modulo completo de gestion de reuniones del proyecto. Incluye:
 *   - Calendario mensual interactivo con reuniones programadas y tentativas
 *   - Tabla paginada con filtros por sprint, tipo y busqueda de texto
 *   - Modal de edicion/creacion de reuniones con formulario completo
 *   - Modal de confirmacion de eliminacion
 *   - Soporte para dos tipos: "Reunion con cliente" (flujo largo con correos) y "Reunion Interna"
 *   - Gestion de fechas propuestas (multi-fecha) y confirmacion de fecha programada
 *   - Selector de presentes (multi-select con nombres del equipo)
 *   - Control de acceso por rol (viewers no pueden editar/crear/eliminar)
 *
 *   Los datos se persisten en la tabla "reuniones" de Supabase.
 */
"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/app/dashboard/RoleContext";
import { getCurrentSprint } from "@/lib/cronogramaData";
import { sortSprints } from "@/lib/utils";

// ─── Constantes ─────────────────────────────────────────────
/** Opciones de modulo/area funcional disponibles para las reuniones */
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

/** Estados posibles para reuniones con cliente (flujo completo con correos) */
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

/** Estados posibles para reuniones internas (flujo simplificado) */
const ESTADO_INTERNA = [
    "1.Tentativa",
    "2.Reunión programada",
    "Cancelada",
    "Reprogramada",
    "Realizada",
];

/** Sugerencias predefinidas de temas para llenado rapido */
const TEMA_SUGGESTIONS = [
    "Seguimiento de avance",
    "Revisión de entregables",
    "Planificación de sprint",
    "Coordinación técnica",
    "Demo / Presentación",
    "Retrospectiva",
];

const PAGE_SIZE = 10;

/** Devuelve clases CSS de fondo y texto segun el estado de la reunion */
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

/** Devuelve clases CSS de fondo y texto segun la prioridad de la reunion */
function getPrioridadColor(p) {
    if (!p) return { bg: "bg-gray-50", text: "text-gray-500" };
    if (p.includes("Alta")) return { bg: "bg-red-50", text: "text-red-600" };
    if (p.includes("Media")) return { bg: "bg-amber-50", text: "text-amber-600" };
    return { bg: "bg-green-50", text: "text-green-600" };
}

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ─── Componente de Calendario ───────────────────────────────────────────────

/**
 * Calendario mensual interactivo que muestra las reuniones programadas y opcionalmente
 * las tentativas. Cada dia del calendario muestra las reuniones con hora y modulo/tema.
 * Permite navegar entre meses y saltar al dia actual.
 * @param {Object} props
 * @param {Array}  props.reuniones - Todas las reuniones para construir el mapa de eventos
 */
function MeetingCalendar({ reuniones, onEventClick }) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [showTentativas, setShowTentativas] = useState(false);
    const [showRealizadas, setShowRealizadas] = useState(true);
    const [showCanceladas, setShowCanceladas] = useState(false);
    const [showCliente, setShowCliente] = useState(true);
    const [showInterna, setShowInterna] = useState(true);

    // Clasifica reuniones por estado
    const { scheduled, tentativas, realizadas, canceladas } = useMemo(() => {
        const s = [], t = [], r = [], c = [];
        reuniones.forEach((rn) => {
            const e = (rn.estado || "").toLowerCase();
            if (e.includes("tentativa")) t.push(rn);
            else if (e.includes("cancelada")) c.push(rn);
            else if (e.includes("realizada")) r.push(rn);
            else if (e.includes("programada") && rn.fecha_programada) s.push(rn);
        });
        return { scheduled: s, tentativas: t, realizadas: r, canceladas: c };
    }, [reuniones]);

    // Construye mapa de eventos por fecha: "YYYY-MM-DD" -> arreglo de eventos
    const eventsMap = useMemo(() => {
        const map = {};
        const addToMap = (r, extra = {}) => {
            const dateStr = r.fecha_programada?.split(" ")[0];
            if (!dateStr) return;
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push({ ...r, ...extra });
        };
        // Programadas siempre visibles
        scheduled.forEach((r) => addToMap(r, { _status: "programada" }));
        // Realizadas
        if (showRealizadas) realizadas.forEach((r) => addToMap(r, { _status: "realizada" }));
        // Canceladas
        if (showCanceladas) canceladas.forEach((r) => addToMap(r, { _status: "cancelada" }));
        // Tentativas
        if (showTentativas) {
            tentativas.forEach((r) => {
                const propuestas = r.fechas_propuestas || [];
                propuestas.forEach((fp) => {
                    if (fp.fecha) {
                        if (!map[fp.fecha]) map[fp.fecha] = [];
                        map[fp.fecha].push({ ...r, _tentativa: true, _hora: fp.hora || "", _status: "tentativa" });
                    }
                });
            });
        }
        // Filtra por tipo
        Object.keys(map).forEach((k) => {
            map[k] = map[k].filter((ev) => {
                if (ev.tipo === "Reunión con cliente" && !showCliente) return false;
                if (ev.tipo === "Reunión Interna" && !showInterna) return false;
                return true;
            });
            if (map[k].length === 0) delete map[k];
        });
        return map;
    }, [scheduled, tentativas, realizadas, canceladas, showTentativas, showRealizadas, showCanceladas, showCliente, showInterna]);

    // ── Construccion de la grilla del calendario ──────────────────────────────
    // Calcula los dias del mes y el desplazamiento del primer dia (Lun=0 ... Dom=6)
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
                    {/* Toggle buttons for status filters */}
                    {[
                        { key: "tentativas", label: "Tentativas", active: showTentativas, toggle: () => setShowTentativas(!showTentativas), count: tentativas.length,
                          activeClass: "bg-amber-50 text-amber-700 border-amber-200", badgeActive: "bg-amber-100 text-amber-600" },
                        { key: "realizadas", label: "Realizadas", active: showRealizadas, toggle: () => setShowRealizadas(!showRealizadas), count: realizadas.length,
                          activeClass: "bg-violet-50 text-violet-700 border-violet-200", badgeActive: "bg-violet-100 text-violet-600" },
                        { key: "canceladas", label: "Canceladas", active: showCanceladas, toggle: () => setShowCanceladas(!showCanceladas), count: canceladas.length,
                          activeClass: "bg-rose-50 text-rose-600 border-rose-200", badgeActive: "bg-rose-100 text-rose-500" },
                    ].map(({ key, label, active, toggle, count, activeClass, badgeActive }) => (
                        <button key={key} onClick={toggle}
                            title={active ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors
                                ${active ? activeClass : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                {active ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                )}
                            </svg>
                            {label}
                            {count > 0 && <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] leading-none ${active ? badgeActive : "bg-gray-200 text-gray-500"}`}>{count}</span>}
                        </button>
                    ))}
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

            {/* Legend – clickable type toggles + status indicators */}
            <div className="flex items-center gap-4 mb-3 flex-wrap">
                <button onClick={() => setShowCliente(!showCliente)}
                    className={`flex items-center gap-1.5 transition-opacity ${showCliente ? "opacity-100" : "opacity-40"}`}
                    title={showCliente ? "Ocultar reuniones con cliente" : "Mostrar reuniones con cliente"}>
                    <span className="w-3 h-3 rounded-sm bg-blue-500" />
                    <span className="text-xs text-gray-500">Reunión con cliente</span>
                </button>
                <button onClick={() => setShowInterna(!showInterna)}
                    className={`flex items-center gap-1.5 transition-opacity ${showInterna ? "opacity-100" : "opacity-40"}`}
                    title={showInterna ? "Ocultar reuniones internas" : "Mostrar reuniones internas"}>
                    <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                    <span className="text-xs text-gray-500">Reunión Interna</span>
                </button>
                {showTentativas && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2 border-dashed border-amber-400 bg-amber-50" />
                        <span className="text-xs text-amber-600 font-medium">Tentativa</span>
                    </div>
                )}
                {showRealizadas && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-violet-500" />
                        <span className="text-xs text-violet-600 font-medium">Realizada</span>
                    </div>
                )}
                {showCanceladas && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm bg-rose-400" />
                        <span className="text-xs text-rose-500 font-medium">Cancelada</span>
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
                        return <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[100px]" />;
                    }
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const events = eventsMap[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isWeekend = (startDay + day - 1) % 7 >= 5;

                    return (
                        <div key={dateStr}
                            className={`min-h-[100px] p-1.5 ${isWeekend ? "bg-gray-50" : "bg-white"} transition-colors`}>
                            <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                                ${isToday ? "bg-orange-500 text-white" : "text-gray-700"}`}>
                                {day}
                            </div>
                            <div className="space-y-0.5">
                                {events.map((ev, evIdx) => {
                                    const isCliente = ev.tipo === "Reunión con cliente";
                                    const isTent = ev._tentativa;
                                    const st = ev._status || "";
                                    const hora = isTent ? (ev._hora || "") : (ev.fecha_programada?.split(" ")[1] || "");
                                    // Estilo según estado
                                    let pillClass;
                                    if (isTent) {
                                        pillClass = "border border-dashed border-amber-300 bg-amber-50/60 text-amber-700 opacity-80";
                                    } else if (st === "realizada") {
                                        pillClass = isCliente
                                            ? "bg-violet-50 text-violet-700 border border-violet-200"
                                            : "bg-violet-50 text-violet-600 border border-violet-200";
                                    } else if (st === "cancelada") {
                                        pillClass = "bg-rose-50 text-rose-500 border border-rose-200 line-through opacity-70";
                                    } else {
                                        pillClass = isCliente ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";
                                    }
                                    const statusLabel = st === "realizada" ? " ✓" : st === "cancelada" ? " ✗" : "";
                                    return (
                                        <div key={`${ev.id}-${evIdx}`}
                                            title={`${isTent ? "[TENTATIVA] " : st === "realizada" ? "[REALIZADA] " : st === "cancelada" ? "[CANCELADA] " : ""}${ev.tipo}\n${ev.modulo || ""}\n${ev.tema || ""}\n${hora ? "Hora: " + hora : ""}`}
                                            onClick={() => onEventClick?.(ev)}
                                            className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity ${pillClass}`}>
                                            {hora && <span className="font-semibold">{hora} </span>}
                                            {ev.modulo || ev.tema || ev.tipo}{statusLabel}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Modal de confirmacion de eliminacion ───────────────────────────────────

/**
 * Modal de confirmacion antes de eliminar una reunion. Usa createPortal
 * para renderizar sobre toda la pagina.
 * @param {Object}   props
 * @param {Function} props.onConfirm - Callback al confirmar la eliminacion
 * @param {Function} props.onCancel  - Callback al cancelar
 */
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

// ─── Modal de detalle de reunion ─────────────────────────────────────────────

/**
 * Panel lateral de solo lectura que muestra el detalle de una reunion.
 * Incluye botones para editar y eliminar (solo para roles no-viewer).
 */
function DetailModal({ row, onEdit, onDelete, onClose, canEdit, onMarkRealizada, onMarkCancelada }) {
    const isCliente = row.tipo === "Reunión con cliente";
    const accentBg = isCliente ? "bg-blue-500" : "bg-emerald-500";
    const accentLight = isCliente ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";
    const ec = getEstadoColor(row.estado);
    const pc = getPrioridadColor(row.prioridad);

    const hora = row.fecha_programada?.split(" ")[1] || "";
    const fecha = row.fecha_programada?.split(" ")[0] || "";

    // Determina si la reunión ya pasó (fecha+hora < ahora)
    const isPast = (() => {
        if (!row.fecha_programada) return false;
        try {
            const [d, t] = row.fecha_programada.split(" ");
            const [y, m, dd] = d.split("-").map(Number);
            const [hh, mm] = (t || "00:00").split(":").map(Number);
            return new Date(y, m - 1, dd, hh, mm) < new Date();
        } catch { return false; }
    })();

    const estadoLow = (row.estado || "").toLowerCase();
    const isProgramada = estadoLow.includes("programada");
    const canMarkRealizada = isProgramada && isPast;
    const canMarkCancelada = isProgramada;

    // Format date nicely
    function formatFecha(f) {
        if (!f) return "";
        try {
            const [y, m, d] = f.split("-");
            const date = new Date(y, m - 1, d);
            return date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        } catch { return f; }
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div
                className="relative bg-white shadow-2xl w-full max-w-md h-screen flex flex-col animate-slide-in-right"
                style={{ borderRadius: "1rem 0 0 1rem" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header con color */}
                <div className={`${accentBg} px-5 pt-5 pb-4 shrink-0`} style={{ borderRadius: "1rem 0 0 0" }}>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-white/70 uppercase tracking-wider">
                            {row.tipo}
                        </span>
                        <button onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/70 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <h2 className="text-lg font-semibold text-white leading-snug">
                        {row.tema || row.modulo || "Sin tema"}
                    </h2>
                    {row.modulo && row.tema && (
                        <p className="text-sm text-white/80 mt-1">{row.modulo}</p>
                    )}
                </div>

                {/* Body */}
                <div className="px-5 py-5 overflow-y-auto flex-1 space-y-4">

                    {/* Fecha y hora */}
                    {(fecha || (row.fechas_propuestas || []).length > 0) && (
                        <div className="flex items-start gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                            </svg>
                            <div>
                                {fecha ? (
                                    <>
                                        <p className="text-sm font-medium text-gray-800 capitalize">{formatFecha(fecha)}</p>
                                        {hora && <p className="text-sm text-gray-500 mt-0.5">{hora} hrs</p>}
                                    </>
                                ) : (
                                    <div className="space-y-1">
                                        <p className="text-xs font-medium text-gray-500">Fechas propuestas:</p>
                                        {(row.fechas_propuestas || []).map((fp, i) => (
                                            <p key={i} className="text-sm text-gray-700">
                                                {formatFecha(fp.fecha)} {fp.hora && `a las ${fp.hora}`}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Estado */}
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${ec.bg} ${ec.text}`}>
                            {row.estado}
                        </span>
                    </div>

                    {/* Prioridad */}
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                        </svg>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${pc.bg} ${pc.text}`}>
                            {row.prioridad || "—"}
                        </span>
                    </div>

                    {/* Sprint */}
                    {row.sprint && (
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                            </svg>
                            <span className="text-sm text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">{row.sprint}</span>
                        </div>
                    )}

                    <div className="border-t border-gray-100" />

                    {/* Presentes */}
                    {(row.presentes || []).length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-600">Participantes ({(row.presentes || []).length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 ml-8">
                                {(row.presentes || []).map((name) => (
                                    <span key={name} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-gray-100 text-sm text-gray-700">
                                        <span className={`w-6 h-6 rounded-full ${accentBg} text-white flex items-center justify-center text-xs font-semibold`}>
                                            {name.charAt(0)}
                                        </span>
                                        <span className="text-xs">{name}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer con acciones */}
                {canEdit && (
                    <div className="px-5 py-4 shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] space-y-2">
                        {/* Quick-status actions */}
                        {(canMarkRealizada || canMarkCancelada) && (
                            <div className="flex items-center gap-2">
                                {canMarkRealizada && (
                                    <button type="button"
                                        onClick={() => { onMarkRealizada?.(row.id); onClose(); }}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Marcar como Realizada
                                    </button>
                                )}
                                {canMarkCancelada && (
                                    <button type="button"
                                        onClick={() => { onMarkCancelada?.(row.id); onClose(); }}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                        Cancelar reunión
                                    </button>
                                )}
                            </div>
                        )}
                        {/* Main actions */}
                        <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => { onClose(); onDelete(row.id); }}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                                Eliminar
                            </button>
                            <button type="button" onClick={() => { onClose(); onEdit(row); }}
                                className={`px-6 py-2 rounded-xl text-sm font-medium text-white ${accentBg} hover:opacity-90 shadow-md transition-all`}>
                                Editar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

// ─── Modal de edicion / creacion (estilo Google Calendar) ────────────────────

/**
 * Panel lateral estilo Google Calendar para crear o editar una reunion.
 * Se desliza desde la derecha con diseño compacto, iconos inline,
 * chips de sugerencia para temas y selector de presentes con busqueda.
 */
function EditModal({ row, sprints, nombres, onSave, onClose, isNew }) {
    // Pre-parse fecha_programada into _customDate/_customTime for the date picker
    const _initCustomDate = (() => {
        if (!row.fecha_programada) return {};
        const parts = row.fecha_programada.split(" ");
        const isInProposed = (row.fechas_propuestas || []).some(
            (fp) => `${fp.fecha} ${fp.hora || ""}`.trim() === row.fecha_programada
        );
        if (isInProposed) return {};
        return { _customDate: parts[0] || "", _customTime: parts[1] || "" };
    })();
    const [form, setForm] = useState({
        ...row,
        fechas_propuestas: row.fechas_propuestas || [],
        presentes: row.presentes || [],
        ..._initCustomDate,
    });
    const [customModulo, setCustomModulo] = useState(
        row.modulo && !MODULO_OPTIONS.includes(row.modulo) ? row.modulo : ""
    );
    const [useCustomModulo, setUseCustomModulo] = useState(
        row.modulo && !MODULO_OPTIONS.includes(row.modulo)
    );
    const [saving, setSaving] = useState(false);
    const [guestSearch, setGuestSearch] = useState("");

    function updateField(field, value) {
        setForm((f) => {
            const updated = { ...f, [field]: value };
            if (field === "tipo") {
                updated.estado = "1.Tentativa";
                updated.fecha_programada = "";
            }
            return updated;
        });
    }

    const estadoOptions = form.tipo === "Reunión con cliente" ? ESTADO_CLIENTE : ESTADO_INTERNA;

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

    const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
    const MINUTES = [0, 15, 30, 45];

    const isCliente = form.tipo === "Reunión con cliente";
    const accentColor = isCliente ? "blue" : "emerald";
    const accentClasses = {
        blue: { bg: "bg-blue-500", hover: "hover:bg-blue-600", light: "bg-blue-50 text-blue-700 border-blue-200", ring: "focus:ring-blue-500/40", shadow: "shadow-blue-500/15" },
        emerald: { bg: "bg-emerald-500", hover: "hover:bg-emerald-600", light: "bg-emerald-50 text-emerald-700 border-emerald-200", ring: "focus:ring-emerald-500/40", shadow: "shadow-emerald-500/15" },
    }[accentColor];

    function TimeSelect({ value, onChange, className }) {
        const [h, m] = (value || "").split(":").map(Number);
        const hour = isNaN(h) ? "" : h;
        const minute = isNaN(m) ? "" : m;
        const emit = (newH, newM) => {
            if (newH === "" || newM === "") {
                onChange(newH !== "" && newM !== "" ? `${newH}:${String(newM).padStart(2, "0")}` : "");
                return;
            }
            onChange(`${newH}:${String(newM).padStart(2, "0")}`);
        };
        return (
            <div className={`flex items-center gap-1 ${className || ""}`}>
                <select value={hour} onChange={(e) => emit(e.target.value === "" ? "" : Number(e.target.value), minute === "" ? 0 : minute)}
                    className="px-1.5 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                    <option value="">HH</option>
                    {HOURS.map((hh) => <option key={hh} value={hh}>{hh}</option>)}
                </select>
                <span className="text-gray-400 font-medium">:</span>
                <select value={minute} onChange={(e) => emit(hour === "" ? 7 : hour, e.target.value === "" ? "" : Number(e.target.value))}
                    className="px-1.5 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white">
                    <option value="">MM</option>
                    {MINUTES.map((mm) => <option key={mm} value={mm}>{String(mm).padStart(2, "0")}</option>)}
                </select>
            </div>
        );
    }

    function addProposedDate() {
        updateField("fechas_propuestas", [...form.fechas_propuestas, { fecha: "", hora: "" }]);
    }

    function removeProposedDate(idx) {
        updateField("fechas_propuestas", form.fechas_propuestas.filter((_, i) => i !== idx));
    }

    function updateProposedDate(idx, field, value) {
        const updated = form.fechas_propuestas.map((d, i) => (i === idx ? { ...d, [field]: value } : d));
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

    const filteredNombres = nombres.filter(
        (n) => !(form.presentes || []).includes(n.Nombre) && n.Nombre.toLowerCase().includes(guestSearch.toLowerCase())
    );

    // ── Iconos SVG inline ────────────────────────────────────────────────────
    const CalendarIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
    );
    const ClockIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
    const SprintIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
    );
    const ModuleIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
    );
    const StatusIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
    const PeopleIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
    );

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
                if (window.confirm("¿Salir sin guardar?")) onClose();
            }} />
            <div
                className="relative bg-white shadow-2xl w-full max-w-md h-screen flex flex-col animate-slide-in-right"
                style={{ borderRadius: "1rem 0 0 1rem" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header - minimal + tipo tabs */}
                <div className="px-5 pt-4 pb-3 shrink-0 space-y-3 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {isNew ? "Nueva reunión" : `Reunión #${row.id}`}
                        </span>
                        <button onClick={() => { if (window.confirm("¿Salir sin guardar?")) onClose(); }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    {/* ── Tipo: tabs de colores (fijos en header) ──────────── */}
                    <div className="flex gap-2">
                        <button type="button" onClick={() => updateField("tipo", "Reunión Interna")}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                                !isCliente
                                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                                    : "bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600"
                            }`}>
                            Interna
                        </button>
                        <button type="button" onClick={() => updateField("tipo", "Reunión con cliente")}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                                isCliente
                                    ? "bg-blue-500 text-white shadow-sm shadow-blue-500/20"
                                    : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                            }`}>
                            Cliente
                        </button>
                    </div>
                </div>

                {/* Form body */}
                <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">

                    {/* ── Tema: input prominente + chips ───────────────────── */}
                    <div>
                        <input
                            type="text"
                            value={form.tema || ""}
                            onChange={(e) => updateField("tema", e.target.value)}
                            className="w-full text-lg font-medium text-gray-900 placeholder-gray-300 border-0 border-b-2 border-gray-200 focus:border-orange-400 pb-2 bg-transparent outline-none transition-colors"
                            placeholder="Agregar tema u objetivo"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {TEMA_SUGGESTIONS.map((t) => (
                                <button key={t} type="button" onClick={() => updateField("tema", t)}
                                    className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                                        form.tema === t
                                            ? `${accentClasses.light} border font-medium`
                                            : "bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600"
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* ── Fechas propuestas (con iconos) ───────────────────── */}
                    {canAddDates && (
                        <div className="space-y-2">
                            {form.fechas_propuestas.map((fp, idx) => (
                                <div key={idx} className="flex items-center gap-2 group">
                                    <CalendarIcon />
                                    <input type="date" value={fp.fecha || ""} onChange={(e) => updateProposedDate(idx, "fecha", e.target.value)}
                                        className="px-2 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white" />
                                    <ClockIcon />
                                    <TimeSelect value={fp.hora || ""} onChange={(val) => updateProposedDate(idx, "hora", val)} />
                                    <button type="button" onClick={() => removeProposedDate(idx)}
                                        className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={addProposedDate}
                                className="inline-flex items-center gap-1.5 ml-7 text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Agregar opción de horario
                            </button>
                        </div>
                    )}

                    {/* ── Fecha programada (confirmar) ─────────────────────── */}
                    {showDatePicker && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                                <CalendarIcon />
                                <span>Confirmar fecha</span>
                            </div>
                            {form.fechas_propuestas.filter((fp) => fp.fecha).map((fp, idx) => {
                                const val = `${fp.fecha} ${fp.hora || ""}`.trim();
                                return (
                                    <label key={idx} className={`flex items-center gap-3 ml-7 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${form.fecha_programada === val ? `${accentClasses.light}` : "border-gray-200 hover:bg-gray-50"}`}>
                                        <input type="radio" name="fecha_confirmada" value={val} checked={form.fecha_programada === val}
                                            onChange={() => updateField("fecha_programada", val)}
                                            className="accent-orange-500" />
                                        <span className="text-sm text-gray-700">{fp.fecha} {fp.hora && `a las ${fp.hora}`}</span>
                                    </label>
                                );
                            })}
                            <label className={`flex items-center gap-3 ml-7 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${form.fecha_programada && !form.fechas_propuestas.some((fp) => `${fp.fecha} ${fp.hora || ""}`.trim() === form.fecha_programada) ? `${accentClasses.light}` : "border-gray-200 hover:bg-gray-50"}`}>
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
                                        className="px-2 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" />
                                    <TimeSelect value={form._customTime || ""} onChange={(val) => {
                                        setForm((f) => ({ ...f, _customTime: val, fecha_programada: `${f._customDate || ""} ${val}`.trim() }));
                                    }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Fecha programada (solo lectura) ──────────────────── */}
                    {!canAddDates && !showDatePicker && form.fecha_programada && (
                        <div className="flex items-center gap-3">
                            <CalendarIcon />
                            <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 flex-1">
                                {form.fecha_programada}
                            </div>
                        </div>
                    )}

                    <div className="border-t border-gray-100" />

                    {/* ── Sprint ────────────────────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <SprintIcon />
                        <select value={form.sprint || ""} onChange={(e) => updateField("sprint", e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white text-gray-700">
                            <option value="">Sprint...</option>
                            {sortSprints(sprints.filter((s) => /F3[.,]\d+/i.test(s))).map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* ── Módulo ────────────────────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <ModuleIcon />
                        {useCustomModulo ? (
                            <div className="flex-1 flex gap-2">
                                <input type="text" value={customModulo} onChange={(e) => setCustomModulo(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Escribir módulo..." />
                                <button type="button" onClick={() => { setUseCustomModulo(false); setCustomModulo(""); }}
                                    className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <select value={form.modulo || ""} onChange={(e) => {
                                if (e.target.value === "__custom__") setUseCustomModulo(true);
                                else updateField("modulo", e.target.value);
                            }}
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white text-gray-700">
                                <option value="">Módulo...</option>
                                {MODULO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                                <option value="__custom__">-- Otro (escribir) --</option>
                            </select>
                        )}
                    </div>

                    {/* ── Estado ────────────────────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <StatusIcon />
                        <select value={form.estado || "1.Tentativa"} onChange={(e) => updateField("estado", e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white text-gray-700">
                            {estadoOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                    </div>

                    {/* ── Prioridad (icon buttons) ─────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="4" />
                            <line x1="8" y1="8" x2="16" y2="8" />
                            <line x1="8" y1="12" x2="16" y2="12" />
                            <line x1="8" y1="16" x2="16" y2="16" />
                        </svg>
                        <div className="flex gap-2 flex-1">
                            {PRIORIDAD_OPTIONS.map((p) => {
                                const selected = (form.prioridad || "2.Media") === p;
                                const label = p.replace(/^\d\./, "");
                                let colors, iconBars, barActive, barMuted;
                                if (p.includes("Alta")) {
                                    colors = selected
                                        ? "bg-red-50 text-red-600 border-2 border-red-400 shadow-sm shadow-red-100"
                                        : "bg-white text-gray-400 border border-gray-200 hover:border-red-300 hover:bg-red-50 hover:text-red-500";
                                    iconBars = 3; barActive = "bg-red-400"; barMuted = "bg-gray-200";
                                } else if (p.includes("Media")) {
                                    colors = selected
                                        ? "bg-amber-50 text-amber-600 border-2 border-amber-400 shadow-sm shadow-amber-100"
                                        : "bg-white text-gray-400 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-500";
                                    iconBars = 2; barActive = "bg-amber-400"; barMuted = "bg-gray-200";
                                } else {
                                    colors = selected
                                        ? "bg-green-50 text-green-600 border-2 border-green-400 shadow-sm shadow-green-100"
                                        : "bg-white text-gray-400 border border-gray-200 hover:border-green-300 hover:bg-green-50 hover:text-green-500";
                                    iconBars = 1; barActive = "bg-green-400"; barMuted = "bg-gray-200";
                                }
                                return (
                                    <button key={p} type="button" onClick={() => updateField("prioridad", p)}
                                        className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${colors}`}>
                                        <div className="flex items-end gap-[3px] h-4">
                                            <span className={`w-[5px] rounded-sm ${selected && iconBars >= 1 ? barActive : selected ? barMuted : iconBars >= 1 ? barActive : barMuted}`} style={{ height: "35%" }} />
                                            <span className={`w-[5px] rounded-sm ${selected && iconBars >= 2 ? barActive : selected ? barMuted : iconBars >= 2 ? barActive : barMuted}`} style={{ height: "65%" }} />
                                            <span className={`w-[5px] rounded-sm ${selected && iconBars >= 3 ? barActive : selected ? barMuted : iconBars >= 3 ? barActive : barMuted}`} style={{ height: "100%" }} />
                                        </div>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* ── Presentes (chips + búsqueda) ─────────────────────── */}
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <PeopleIcon />
                            <span className="text-sm font-medium text-gray-600">Participantes</span>
                            {(form.presentes || []).length > 0 && (
                                <span className="text-xs text-gray-400 ml-auto">{(form.presentes || []).length} seleccionados</span>
                            )}
                        </div>

                        {/* Chips de seleccionados */}
                        {(form.presentes || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 ml-8 mb-3">
                                {(form.presentes || []).map((name) => (
                                    <span key={name} className="inline-flex items-center gap-1 pl-1 pr-2 py-1 rounded-full bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 transition-colors">
                                        <span className={`w-6 h-6 rounded-full ${accentClasses.bg} text-white flex items-center justify-center text-xs font-semibold`}>
                                            {name.charAt(0)}
                                        </span>
                                        <span className="text-xs">{name}</span>
                                        <button type="button" onClick={() => togglePresente(name)}
                                            className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Buscador */}
                        <div className="ml-8">
                            <input
                                type="text"
                                value={guestSearch}
                                onChange={(e) => setGuestSearch(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 bg-white"
                                placeholder="Buscar participante..."
                            />
                            {/* Sugerencias */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {filteredNombres.map((n) => (
                                    <button key={n.Nombre} type="button" onClick={() => { togglePresente(n.Nombre); setGuestSearch(""); }}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-all">
                                        {n.Nombre}
                                    </button>
                                ))}
                                {filteredNombres.length === 0 && !guestSearch && nombres.length > 0 && (form.presentes || []).length === nombres.length && (
                                    <span className="text-xs text-gray-400">Todos seleccionados</span>
                                )}
                                {filteredNombres.length === 0 && guestSearch && (
                                    <span className="text-xs text-gray-400">No se encontraron coincidencias</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 flex items-center justify-end gap-3 shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
                    <button type="button" onClick={() => { if (window.confirm("¿Salir sin guardar?")) onClose(); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving}
                        className={`px-6 py-2 rounded-xl text-sm font-medium text-white ${accentClasses.bg} ${accentClasses.hover} shadow-md ${accentClasses.shadow} transition-all disabled:opacity-50 disabled:cursor-wait`}>
                        {saving ? "Guardando..." : (isNew ? "Crear" : "Guardar")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * Tabla principal de reuniones con calendario, filtros, paginacion y CRUD completo.
 * @param {Object}   props
 * @param {Array}    props.reuniones  - Arreglo de reuniones desde Supabase
 * @param {Array}    props.sprints    - Lista de sprints disponibles para los dropdowns
 * @param {Array}    props.nombres    - Nombres del equipo para el selector de presentes
 * @param {Function} [props.onRefresh] - Callback para recargar datos despues de crear/editar/eliminar
 */
export default function ReunionesTable({ reuniones = [], sprints = [], nombres = [], onRefresh }) {
    const role = useRole();
    const [search, setSearch] = useState("");
    const [editRow, setEditRow] = useState(null);
    const [detailRow, setDetailRow] = useState(null);
    const [deleteId, setDeleteId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [filterSprint, setFilterSprint] = useState("");
    const [filterTipo, setFilterTipo] = useState("");

    // ── Filtrado ─────────────────────────────────────────────────────────────
    // Aplica busqueda de texto (tema, modulo, sprint) y filtros de sprint y tipo
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

    /** Marca una reunión como Realizada */
    async function handleMarkRealizada(id) {
        await supabase.from("reuniones").update({ estado: "Realizada" }).eq("id", id);
        setDetailRow(null);
        onRefresh?.();
    }

    /** Marca una reunión como Cancelada */
    async function handleMarkCancelada(id) {
        if (!window.confirm("¿Estás seguro de cancelar esta reunión?")) return;
        await supabase.from("reuniones").update({ estado: "Cancelada" }).eq("id", id);
        setDetailRow(null);
        onRefresh?.();
    }

    /** Guarda o crea una reunion en Supabase y recarga los datos */
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

    /** Elimina una reunion de Supabase y recarga los datos */
    async function handleDelete(id) {
        await supabase.from("reuniones").delete().eq("id", id);
        setDeleteId(null);
        onRefresh?.();
    }

    /** Abre el modal de creacion con un template de reunion vacio */
    function openNew() {
        const currentSprint = getCurrentSprint();
        setEditRow({
            sprint: currentSprint?.iteracion || "",
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
            <MeetingCalendar reuniones={reuniones} onEventClick={(ev) => setDetailRow(ev)} />

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
                                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setDetailRow(r)}>
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
                                                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                {detailRow && (
                    <DetailModal
                        row={detailRow}
                        onEdit={(r) => setEditRow(r)}
                        onDelete={(id) => setDeleteId(id)}
                        onClose={() => setDetailRow(null)}
                        canEdit={role !== "viewer"}
                        onMarkRealizada={handleMarkRealizada}
                        onMarkCancelada={handleMarkCancelada}
                    />
                )}
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
