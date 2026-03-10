"use client";

import { useRef, useCallback } from "react";

// ─── Toolbar button definitions ──────────────────────────
const TOOLBAR_BUTTONS = [
  { id: "bold", label: "N", title: "Negrita", prefix: "**", suffix: "**", placeholder: "texto en negrita", style: "font-bold" },
  { id: "italic", label: "I", title: "Cursiva", prefix: "*", suffix: "*", placeholder: "texto en cursiva", style: "italic" },
  { id: "heading", label: "H", title: "Encabezado", prefix: "### ", suffix: "", placeholder: "Encabezado", style: "font-bold text-[13px]" },
  { id: "divider1" },
  { id: "ul", label: "• Lista", title: "Lista con viñetas", prefix: "- ", suffix: "", placeholder: "Elemento", style: "text-[11px]", isLine: true },
  { id: "ol", label: "1. Lista", title: "Lista numerada", prefix: "1. ", suffix: "", placeholder: "Elemento", style: "text-[11px]", isLine: true },
  { id: "divider2" },
  { id: "link", label: "🔗", title: "Enlace", prefix: "[", suffix: "](url)", placeholder: "texto del enlace", style: "" },
  { id: "code", label: "</>", title: "Código", prefix: "`", suffix: "`", placeholder: "código", style: "font-mono text-[11px]" },
];

export default function MarkdownEditor({ value, onChange, rows = 4, placeholder }) {
  const textareaRef = useRef(null);

  const applyFormat = useCallback((btn) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value || "";
    const selected = text.substring(start, end);

    let newText;
    let cursorPos;

    if (btn.isLine) {
      // Line-based formatting (lists): put prefix at beginning of line
      const before = text.substring(0, start);
      const after = text.substring(end);
      const insertion = selected || btn.placeholder;
      const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      newText = before + needsNewline + btn.prefix + insertion + after;
      cursorPos = before.length + needsNewline.length + btn.prefix.length + insertion.length;
    } else {
      // Inline formatting: wrap selection
      const before = text.substring(0, start);
      const after = text.substring(end);
      const insertion = selected || btn.placeholder;
      newText = before + btn.prefix + insertion + btn.suffix + after;

      if (selected) {
        // Keep selection highlighted
        cursorPos = start + btn.prefix.length + insertion.length + btn.suffix.length;
      } else {
        // Place cursor inside the formatting
        cursorPos = start + btn.prefix.length + insertion.length;
      }
    }

    onChange(newText);

    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(
          start + btn.prefix.length,
          start + btn.prefix.length + (selected || btn.placeholder).length
        );
      } else {
        textarea.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [value, onChange]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/40 focus-within:border-orange-400 transition-all">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {TOOLBAR_BUTTONS.map((btn) =>
          btn.id.startsWith("divider") ? (
            <div key={btn.id} className="w-px h-5 bg-gray-200 mx-1" />
          ) : (
            <button
              key={btn.id}
              type="button"
              title={btn.title}
              onClick={() => applyFormat(btn)}
              className={`px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-white hover:text-orange-600 hover:shadow-sm transition-all ${btn.style}`}
            >
              {btn.label}
            </button>
          )
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder || "Escribe aquí... Usa los botones para dar formato."}
        className="w-full px-3 py-2 text-sm font-mono border-0 focus:outline-none resize-y bg-white"
      />
    </div>
  );
}
