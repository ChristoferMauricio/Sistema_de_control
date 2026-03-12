"use client";

import dynamic from "next/dynamic";

const MDEditor = dynamic(
  () => import("@uiw/react-md-editor"),
  { ssr: false }
);

export default function MarkdownEditor({ value, onChange, rows, placeholder }) {
  // Use a sensible default height based on rows
  const editorHeight = rows ? Math.max(rows * 30, 200) : 350;

  return (
    <div data-color-mode="light" className="w-full border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/40 focus-within:border-orange-400 transition-all">
      <MDEditor
        value={value || ""}
        onChange={(val) => onChange(val || "")}
        preview="live"
        height={editorHeight}
        textareaProps={{
          placeholder: placeholder || "Escribe aquí... Usa los botones para dar formato y mira la vista previa al lado."
        }}
        visibleDragbar={false}
        hideToolbar={false}
      />
    </div>
  );
}
