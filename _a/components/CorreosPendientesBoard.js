/**
 * @file CorreosPendientesBoard.js
 * @description Tablero de recuadros del módulo "Correos pendientes". Cada recuadro
 *   permite añadir una imagen de tres maneras (como el buscador de imágenes de Google):
 *     1. Pegar con Ctrl+V (listener global de "paste" + botón que lee el portapapeles)
 *     2. Arrastrar y soltar (drag & drop)
 *     3. Clic para abrir el selector de archivos
 *   Además, cada recuadro tiene un título editable y un historial de trazabilidad
 *   (modal) que registra cada subida/reemplazo de imagen, edición de título,
 *   creación y eliminación. Las imágenes reemplazadas se conservan en Storage,
 *   por lo que desde el historial siempre se pueden consultar versiones anteriores.
 *
 *   Flujo del Ctrl+V global: la imagen pegada va al recuadro seleccionado (clic);
 *   si no hay selección, al primer recuadro vacío; si no hay vacíos, se crea
 *   un recuadro nuevo automáticamente.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon, Plus, X, History, Loader2, AlertCircle, ClipboardPaste, ArrowRight, Download,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** Etiquetas y colores por tipo de acción del historial */
const ACCION_META = {
  creacion: { label: "Recuadro creado", cls: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700" },
  imagen_subida: { label: "Imagen subida", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50" },
  imagen_reemplazada: { label: "Imagen reemplazada", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50" },
  titulo_editado: { label: "Título editado", cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-900/50" },
  estado_editado: { label: "Estado cambiado", cls: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-900/50" },
  detalle_editado: { label: "Detalle editado", cls: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-900/50" },
  eliminacion: { label: "Recuadro eliminado", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50" },
};

/** Estados de atención de un recuadro, con estilos para el selector y el Excel */
const ESTADOS = [
  { value: "Pendiente", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800", xlsx: { fg: "FEF3C7", font: "92400E" } },
  { value: "En proceso o espera", cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800", xlsx: { fg: "DBEAFE", font: "1E40AF" } },
  { value: "Finalizado o Atendido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800", xlsx: { fg: "D1FAE5", font: "065F46" } },
  { value: "Falta respuesta", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800", xlsx: { fg: "FEE2E2", font: "991B1B" } },
];

const getEstadoMeta = (estado) => ESTADOS.find((e) => e.value === estado) || ESTADOS[0];

/**
 * Tablero de recuadros con imágenes pegables y trazabilidad.
 * @param {Object} props
 * @param {string} props.userEmail - Email del usuario actual (para registrar en el historial)
 */
export default function CorreosPendientesBoard({ userEmail }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);   // Recuadro destino del Ctrl+V
  const [uploadingIds, setUploadingIds] = useState([]); // Recuadros con subida en curso
  const [dragOverId, setDragOverId] = useState(null);
  const [localTitles, setLocalTitles] = useState({});
  const [localDetalles, setLocalDetalles] = useState({});
  const [exporting, setExporting] = useState(false);    // Exportación a Excel en curso
  const [toast, setToast] = useState(null);             // { type: 'error'|'success', msg }
  const [confirmDelete, setConfirmDelete] = useState(null); // Card a eliminar
  const [historyCard, setHistoryCard] = useState(null); // Card cuyo historial se muestra
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Refs para que el listener global de paste no capture estado obsoleto
  const cardsRef = useRef(cards);
  const selectedRef = useRef(selectedId);
  cardsRef.current = cards;
  selectedRef.current = selectedId;

  // Input de archivo compartido; fileTargetRef indica a qué recuadro va la imagen
  const fileInputRef = useRef(null);
  const fileTargetRef = useRef(null);

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ─── Carga inicial ─────────────────────────────────────────────────────── */
  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch("/api/correos-pendientes");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error cargando recuadros");
      setCards(json.data || []);
      setFetchError(null);
    } catch (e) {
      console.error(e);
      setFetchError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  /* ─── Acciones ──────────────────────────────────────────────────────────── */

  /** Crea un recuadro vacío y lo devuelve (o null si falla) */
  const addCard = useCallback(async () => {
    try {
      const res = await fetch("/api/correos-pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: userEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error creando recuadro");
      setCards((prev) => [...prev, json.data]);
      setSelectedId(json.data.id);
      return json.data;
    } catch (e) {
      console.error(e);
      showToast("error", e.message);
      return null;
    }
  }, [userEmail, showToast]);

  /** Sube/reemplaza la imagen de un recuadro y actualiza el estado local */
  const uploadImage = useCallback(async (cardId, file) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast("error", "Solo se permiten imágenes (PNG, JPG, GIF, WebP, BMP)");
      return;
    }
    if (file.size > MAX_SIZE) {
      showToast("error", "La imagen supera el límite de 10MB");
      return;
    }

    setUploadingIds((prev) => [...prev, cardId]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("correo_id", String(cardId));
      if (userEmail) formData.append("usuario", userEmail);

      const res = await fetch("/api/correos-pendientes/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error subiendo imagen");

      setCards((prev) => prev.map((c) => (c.id === cardId ? json.data : c)));
      showToast("success", "Imagen guardada correctamente");
    } catch (e) {
      console.error(e);
      showToast("error", e.message);
    }
    setUploadingIds((prev) => prev.filter((id) => id !== cardId));
  }, [userEmail, showToast]);

  /**
   * Listener global de Ctrl+V: si el portapapeles trae una imagen, la sube al
   * recuadro seleccionado → primer recuadro vacío → recuadro nuevo (auto-creado).
   */
  useEffect(() => {
    const handlePaste = async (e) => {
      // No interferir cuando se pega texto dentro de un input/textarea
      const tag = document.activeElement?.tagName;
      const isTextField = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable;

      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((it) => it.type.startsWith("image/"));
      if (!imageItem) return;          // Sin imagen en el portapapeles: comportamiento normal
      if (isTextField) return;         // Pegando dentro de un campo de texto: no capturar

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      // Resolver recuadro destino
      let target = cardsRef.current.find((c) => c.id === selectedRef.current);
      if (!target) target = cardsRef.current.find((c) => !c.imagen_url);
      if (!target) {
        target = await addCard();
        if (!target) return;
      }
      setSelectedId(target.id);
      uploadImage(target.id, file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addCard, uploadImage]);

  /** Botón "PEGAR IMAGEN (Ctrl+V)": lee el portapapeles directamente */
  const pasteFromClipboard = useCallback(async (cardId) => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const file = new File([blob], `pegado.${type.split("/")[1]}`, { type });
          uploadImage(cardId, file);
          return;
        }
      }
      showToast("error", "El portapapeles no contiene ninguna imagen");
    } catch (e) {
      // Permiso denegado o navegador sin soporte: guiar al atajo de teclado
      showToast("error", "No se pudo leer el portapapeles. Selecciona el recuadro y presiona Ctrl+V");
    }
  }, [uploadImage, showToast]);

  /** Abre el selector de archivos apuntando a un recuadro */
  const openFilePicker = useCallback((cardId) => {
    fileTargetRef.current = cardId;
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && fileTargetRef.current != null) {
      uploadImage(fileTargetRef.current, file);
    }
    e.target.value = ""; // Permitir volver a elegir el mismo archivo
  };

  /**
   * Guarda un campo editable (titulo, estado o detalle) si cambió.
   * El servidor registra la trazabilidad por cada campo modificado.
   */
  const saveField = useCallback(async (card, field, value) => {
    if (value === undefined || value === (card[field] ?? "")) return;
    try {
      const res = await fetch("/api/correos-pendientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, [field]: value, usuario: userEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error guardando ${field}`);
      setCards((prev) => prev.map((c) => (c.id === card.id ? json.data : c)));
    } catch (e) {
      console.error(e);
      showToast("error", e.message);
    }
  }, [userEmail, showToast]);

  const saveTitle = useCallback((card) => saveField(card, "titulo", localTitles[card.id]), [saveField, localTitles]);
  const saveDetalle = useCallback((card) => saveField(card, "detalle", localDetalles[card.id]), [saveField, localDetalles]);

  /**
   * Exporta el tablero a Excel (.xlsx) con la ÚLTIMA imagen de cada recuadro
   * embebida en la celda, más título, estado (con color) y detalle.
   */
  const handleExportExcel = useCallback(async () => {
    if (cards.length === 0) {
      showToast("error", "No hay recuadros para exportar");
      return;
    }
    setExporting(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const { injectImagesIntoSheet } = await import("@/lib/excelImageInjector");

      // Dimensiones de la celda de imagen (deben coincidir con !cols/!rows de abajo)
      const IMG_COL_WCH = 22;                                  // ancho en caracteres
      const IMG_COL_PX = Math.floor(IMG_COL_WCH * 7 + 5);      // ≈159 px
      const IMG_ROW_HPT = 84;                                  // alto en puntos
      const IMG_ROW_PX = Math.round(IMG_ROW_HPT * 4 / 3);      // ≈112 px

      /* ─── Datos ─── */
      const header = ["N°", "Imagen", "Título", "Estado", "Detalle", "Fecha creación", "Última actualización"];
      const fmt = (d) => { try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: es }); } catch { return "-"; } };
      const rows = cards.map((c, i) => [
        i + 1,
        c.imagen_url ? "" : "Sin imagen",   // La imagen se incrusta encima de esta celda
        c.titulo || "-",
        c.estado || "Pendiente",
        c.detalle || "-",
        fmt(c.created_at),
        fmt(c.updated_at),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = [
        { wch: 5 }, { wch: IMG_COL_WCH }, { wch: 30 }, { wch: 22 }, { wch: 48 }, { wch: 17 }, { wch: 17 },
      ];
      // Altura de filas: cabecera normal; filas con imagen altas para que la foto se vea
      ws["!rows"] = [{ hpt: 22 }, ...cards.map((c) => ({ hpt: c.imagen_url ? IMG_ROW_HPT : 22 }))];

      /* ─── Estilos ─── */
      const orangeHeader = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: "F97316" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
      header.forEach((_, col) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
        if (cell) cell.s = orangeHeader;
      });
      cards.forEach((c, i) => {
        const r = i + 1;
        const at = (col) => ws[XLSX.utils.encode_cell({ r, c: col })];
        const center = { vertical: "center" };
        if (at(0)) at(0).s = { alignment: { horizontal: "center", ...center }, font: { sz: 10 } };
        if (at(1)) at(1).s = { alignment: { horizontal: "center", ...center }, font: { sz: 9, color: { rgb: "9CA3AF" } } };
        if (at(2)) at(2).s = { alignment: { ...center, wrapText: true }, font: { sz: 11, bold: true } };
        const em = getEstadoMeta(c.estado);
        if (at(3)) at(3).s = {
          alignment: { horizontal: "center", ...center },
          font: { sz: 10, bold: true, color: { rgb: em.xlsx.font } },
          fill: { fgColor: { rgb: em.xlsx.fg } },
        };
        // Detalle con letra más pequeña y ajuste de texto (igual que en la UI)
        if (at(4)) at(4).s = { alignment: { ...center, wrapText: true }, font: { sz: 9 } };
        if (at(5)) at(5).s = { alignment: { horizontal: "center", ...center }, font: { sz: 9 } };
        if (at(6)) at(6).s = { alignment: { horizontal: "center", ...center }, font: { sz: 9 } };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Correos pendientes");
      const wbBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

      /* ─── Descargar la última imagen de cada recuadro e incrustarla ─── */
      const images = [];
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c.imagen_url) continue;
        try {
          const resp = await fetch(c.imagen_url);
          if (!resp.ok) continue;
          const bytes = await resp.arrayBuffer();
          const ext = (c.imagen_path?.split(".").pop() || "png").toLowerCase();
          images.push({ sheetRow: i + 1, bytes, ext }); // +1 por la fila de cabecera
        } catch (e) {
          console.error(`No se pudo descargar la imagen del recuadro ${c.id}:`, e);
        }
      }

      const blob = await injectImagesIntoSheet(wbBuffer, {
        sheetIndex: 1,
        anchorCol: 1,
        colWidthPx: IMG_COL_PX,
        rowHeightPx: IMG_ROW_PX,
        insetPx: 3,
        images,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Correos_Pendientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("success", `Excel exportado (${cards.length} recuadros, ${images.length} imágenes)`);
    } catch (e) {
      console.error(e);
      showToast("error", "Error exportando: " + e.message);
    }
    setExporting(false);
  }, [cards, showToast]);

  /** Eliminación suave del recuadro (el historial y las imágenes se conservan) */
  const deleteCard = useCallback(async (card) => {
    setConfirmDelete(null);
    try {
      const res = await fetch("/api/correos-pendientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, usuario: userEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error eliminando recuadro");
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      if (selectedId === card.id) setSelectedId(null);
      showToast("success", "Recuadro eliminado (su historial se conserva)");
    } catch (e) {
      console.error(e);
      showToast("error", e.message);
    }
  }, [userEmail, selectedId, showToast]);

  /** Abre el modal de trazabilidad y carga el historial del recuadro */
  const openHistory = useCallback(async (card) => {
    setHistoryCard(card);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const res = await fetch(`/api/correos-pendientes/historial?correo_id=${card.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error cargando historial");
      setHistoryRows(json.data || []);
    } catch (e) {
      console.error(e);
      showToast("error", e.message);
    }
    setHistoryLoading(false);
  }, [showToast]);

  /* ─── Drag & Drop ───────────────────────────────────────────────────────── */
  const handleDrop = (e, cardId) => {
    e.preventDefault();
    setDragOverId(null);
    const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/"));
    if (file) {
      setSelectedId(cardId);
      uploadImage(cardId, file);
    } else {
      showToast("error", "Suelta un archivo de imagen");
    }
  };

  const formatFecha = (d) => {
    try { return format(new Date(d), "dd MMM yyyy, HH:mm", { locale: es }); }
    catch { return "-"; }
  };

  /* ─── Render ────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-72 rounded-2xl" />)}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-8 text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-700 dark:text-red-400 font-medium">No se pudo cargar el tablero</p>
        <p className="text-sm text-red-600/80 dark:text-red-400/70 mt-1">{fetchError}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Si es la primera vez que usas el módulo, verifica que la migración
          <code className="mx-1 px-1.5 py-0.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">008_create_correos_pendientes.sql</code>
          haya sido ejecutada en Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Input de archivo compartido (oculto) */}
      <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={handleFileChange} />

      {/* Barra superior: consejo + añadir */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-orange-500 shrink-0" />
          Haz clic en un recuadro y presiona <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">V</kbd> para pegar una imagen. También puedes arrastrarla o hacer clic para subirla.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Exportar a Excel (con la última imagen de cada recuadro embebida) */}
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-xl shadow-sm transition-all ${
              exporting ? "bg-emerald-400 cursor-wait" : "bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]"
            }`}
            title="Exportar a Excel (incluye la última imagen de cada recuadro)"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            onClick={addCard}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md shadow-orange-500/15 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Añadir recuadro
          </button>
        </div>
      </div>

      {/* Grid de recuadros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {cards.map((card) => {
          const isUploading = uploadingIds.includes(card.id);
          const isSelected = selectedId === card.id;
          const isDragOver = dragOverId === card.id;

          return (
            <div
              key={card.id}
              onClick={() => setSelectedId(card.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(card.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => handleDrop(e, card.id)}
              className={`relative rounded-2xl transition-all duration-200 ${
                isSelected ? "ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-gray-950" : ""
              } ${isDragOver ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-950 scale-[1.01]" : ""}`}
            >
              {card.imagen_url ? (
                /* ─── Recuadro con imagen ─── */
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex flex-col gap-3 transition-colors">
                  <div
                    className="relative rounded-xl overflow-hidden aspect-square bg-gray-50 dark:bg-gray-800 group cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setSelectedId(card.id); openFilePicker(card.id); }}
                    title="Clic, Ctrl+V o arrastrar para reemplazar la imagen"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.imagen_url} alt={card.titulo || `Recuadro ${card.id}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-white">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs font-medium">Reemplazar: clic, Ctrl+V o arrastrar</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={localTitles[card.id] ?? card.titulo ?? ""}
                      placeholder="Añadir título..."
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setLocalTitles((prev) => ({ ...prev, [card.id]: e.target.value }))}
                      onBlur={() => saveTitle(card)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      className="flex-1 min-w-0 text-base font-medium text-gray-900 dark:text-gray-100 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 rounded-lg px-2 py-1 outline-none transition-colors"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); openHistory(card); }}
                      className="p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0"
                      title="Ver trazabilidad de este recuadro"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(card); }}
                      className="p-2 rounded-full text-gray-400 hover:text-red-600 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0"
                      title="Eliminar recuadro"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Estado de atención del correo */}
                  <select
                    value={card.estado || "Pendiente"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => saveField(card, "estado", e.target.value)}
                    className={`w-full text-xs font-semibold rounded-lg border px-2.5 py-1.5 cursor-pointer outline-none focus:ring-2 focus:ring-orange-500/20 transition-colors ${getEstadoMeta(card.estado).cls}`}
                    title="Estado de atención"
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.value} value={e.value}>{e.value}</option>
                    ))}
                  </select>

                  {/* Detalle: de qué se trata el correo (letra más pequeña) */}
                  <textarea
                    rows={2}
                    value={localDetalles[card.id] ?? card.detalle ?? ""}
                    placeholder="Añadir detalle de qué se trata..."
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setLocalDetalles((prev) => ({ ...prev, [card.id]: e.target.value }))}
                    onBlur={() => saveDetalle(card)}
                    className="w-full text-xs leading-relaxed text-gray-600 dark:text-gray-300 bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 rounded-lg px-2 py-1.5 outline-none resize-none transition-colors"
                  />
                </div>
              ) : (
                /* ─── Recuadro vacío (placeholder de pegado) ─── */
                <div
                  className="rounded-2xl border-2 border-dashed border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10 min-h-[300px] p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => { setSelectedId(card.id); openFilePicker(card.id); }}
                >
                  <div className="w-14 h-14 rounded-xl border-[3px] border-blue-600 dark:border-blue-400 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <ImageIcon className="w-8 h-8" strokeWidth={2.2} />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                      Pegar Imagen (Ctrl+V)<br />o Arrastrar
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Haz clic para subir</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedId(card.id); pasteFromClipboard(card.id); }}
                    className="mt-1 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-sm font-bold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    PEGAR IMAGEN (Ctrl+V)
                  </button>
                  {/* Acciones secundarias del recuadro vacío */}
                  <div className="absolute top-2.5 right-2.5 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openHistory(card); }}
                      className="p-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                      title="Ver trazabilidad de este recuadro"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(card); }}
                      className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                      title="Eliminar recuadro"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Overlay de subida en curso */}
              {isUploading && (
                <div className="absolute inset-0 rounded-2xl bg-white/70 dark:bg-gray-950/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10">
                  <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subiendo imagen...</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Tile fantasma: añadir recuadro */}
        <button
          onClick={addCard}
          className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 min-h-[300px] flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50/40 dark:hover:bg-orange-900/10 transition-colors"
        >
          <Plus className="w-8 h-8" />
          <span className="text-sm font-medium">Añadir recuadro</span>
        </button>
      </div>

      {/* ─── Modal de confirmación de eliminación ─── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-gray-900/40 z-40 flex justify-center items-center px-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center mb-1">¿Eliminar recuadro?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {confirmDelete.titulo ? <>Se eliminará <strong>"{confirmDelete.titulo}"</strong>.</> : "Se eliminará este recuadro."}
              {" "}Su historial de trazabilidad se conservará.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteCard(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de trazabilidad (historial del recuadro) ─── */}
      {historyCard && (
        <div
          className="fixed inset-0 bg-gray-900/40 z-40 flex justify-center items-start pt-[8vh] overflow-y-auto pb-10 px-4"
          onClick={() => setHistoryCard(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                    Trazabilidad {historyCard.titulo ? `— ${historyCard.titulo}` : `— Recuadro #${historyCard.id}`}
                  </h3>
                  <p className="text-xs text-gray-400">Historial de cambios de este recuadro</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryCard(null)}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo: línea de tiempo */}
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/60">
              {historyLoading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                </div>
              ) : historyRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">Sin registros de historial.</p>
              ) : (
                historyRows.map((row) => {
                  const meta = ACCION_META[row.accion] || ACCION_META.creacion;
                  const isImageAction = row.accion === "imagen_subida" || row.accion === "imagen_reemplazada";
                  return (
                    <div key={row.id} className="px-6 py-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-gray-400">{formatFecha(row.changed_at)}</span>
                      </div>

                      {/* Miniaturas de versión anterior → nueva (siguen accesibles en Storage) */}
                      {isImageAction && (
                        <div className="flex items-center gap-3 mt-3">
                          {row.imagen_url_anterior ? (
                            <a href={row.imagen_url_anterior} target="_blank" rel="noopener noreferrer" className="group text-center" title="Ver imagen anterior (tamaño completo)">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.imagen_url_anterior} alt="Versión anterior" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 group-hover:ring-2 group-hover:ring-blue-400 transition-all" />
                              <span className="text-[10px] text-gray-400 block mt-1">Anterior</span>
                            </a>
                          ) : (
                            <div className="text-center">
                              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600">
                                <ImageIcon className="w-6 h-6" />
                              </div>
                              <span className="text-[10px] text-gray-400 block mt-1">Sin imagen</span>
                            </div>
                          )}
                          <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                          {row.imagen_url_nueva && (
                            <a href={row.imagen_url_nueva} target="_blank" rel="noopener noreferrer" className="group text-center" title="Ver imagen nueva (tamaño completo)">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.imagen_url_nueva} alt="Versión nueva" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 group-hover:ring-2 group-hover:ring-emerald-400 transition-all" />
                              <span className="text-[10px] text-gray-400 block mt-1">Nueva</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Cambio de texto: título, estado o detalle (anterior → nuevo) */}
                      {["titulo_editado", "estado_editado", "detalle_editado"].includes(row.accion) && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 break-words">
                          <span className="line-through text-gray-400">"{row.titulo_anterior || "—"}"</span>
                          <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-gray-300" />
                          <span className="font-medium">"{row.titulo_nuevo || "—"}"</span>
                        </p>
                      )}

                      {row.usuario && (
                        <p className="text-xs text-gray-400 mt-2">Por: {row.usuario}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast de notificaciones ─── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg animate-slide-up flex items-center gap-2 ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-900"
              : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-400 dark:border-red-900"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
