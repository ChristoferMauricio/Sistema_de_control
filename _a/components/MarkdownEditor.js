/**
 * @file MarkdownEditor.js
 * @description Wrapper del editor Markdown (@uiw/react-md-editor) con soporte para
 *   modo oscuro/claro, carga dinamica (sin SSR) y configuracion simplificada.
 *   Se usa en los modales de edicion de comentarios de tickets y observaciones.
 */
"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@/app/dashboard/ThemeContext";

// Carga dinamica del editor Markdown para evitar errores de SSR (el editor depende de window/document)
const MDEditor = dynamic(
  () => import("@uiw/react-md-editor"),
  { ssr: false }
);

/**
 * Editor Markdown con vista previa en vivo y soporte de tema claro/oscuro.
 * @param {Object}   props
 * @param {string}   props.value       - Contenido Markdown actual
 * @param {Function} props.onChange     - Callback al modificar el contenido
 * @param {number}   [props.rows]       - Numero de filas para calcular la altura (default: ~350px)
 * @param {string}   [props.placeholder] - Texto placeholder del textarea
 */
export default function MarkdownEditor({ value, onChange, rows, placeholder }) {
  const { isDark } = useTheme();

  // Calcula la altura del editor basado en el numero de filas, con un minimo de 200px
  const editorHeight = rows ? Math.max(rows * 30, 200) : 350;

  return (
    <div data-color-mode={isDark ? "dark" : "light"} className="w-full border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/40 focus-within:border-orange-400 transition-all">
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
        extraCommands={[]} // Disables fullscreen button
      />
    </div>
  );
}
