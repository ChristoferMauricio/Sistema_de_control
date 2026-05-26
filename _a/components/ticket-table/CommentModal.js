/**
 * @file CommentModal.js
 * @description Modal para editar el comentario/observacion de un ticket Jira.
 *   Utiliza el componente MarkdownEditor para soporte de formato Markdown.
 *   Muestra la clave del ticket, story points y resumen en el encabezado.
 *   El modal se cierra al cancelar o al guardar exitosamente.
 *   Renderiza null si no hay comentario en edicion (patron de "modal controlado").
 */
"use client";

import MarkdownEditor from "@/components/MarkdownEditor";

/**
 * Modal de edicion de comentarios con editor Markdown y controles de guardado.
 * @param {Object}   props
 * @param {Object|null} props.editingComment - Datos del comentario en edicion ({ key, summary, story_points, currentText }) o null para ocultar
 * @param {Function} props.onClose          - Callback para cerrar el modal
 * @param {Function} props.onChange          - Callback al cambiar el texto del comentario
 * @param {Function} props.onSave           - Callback para guardar el comentario
 * @param {boolean}  props.savingComment     - Indica si se esta guardando (para deshabilitar botones y mostrar spinner)
 */
export default function CommentModal({ editingComment, onClose, onChange, onSave, savingComment }) {
  if (!editingComment) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-base font-semibold text-gray-800 flex items-center flex-wrap gap-2">
            Editar Comentario
            <span className="text-orange-600 font-mono text-xs bg-orange-100 px-2 py-0.5 rounded shrink-0">
              {editingComment.key}
            </span>
            {editingComment.story_points != null && (
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold shrink-0"
                title="Story Points"
              >
                {editingComment.story_points}
              </span>
            )}
            {editingComment.summary && (
              <span className="text-sm font-normal text-gray-500 truncate max-w-[300px]" title={editingComment.summary}>
                {editingComment.summary}
              </span>
            )}
          </h3>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all" aria-label="Cerrar modal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Editor */}
        <div className="p-6 flex-1 flex flex-col min-h-[350px]">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider mb-2">
            Formato Markdown soportado
          </label>
          <div className="flex-1 w-full relative">
            <MarkdownEditor
              value={editingComment.currentText}
              onChange={(val) => onChange(val)}
              rows={10}
              placeholder="Escribe un comentario aquí..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end items-center gap-3">
          <button
            onClick={onClose}
            disabled={savingComment}
            className="px-5 py-2.5 sm:py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={savingComment}
            className="px-5 py-2.5 sm:py-2 rounded-xl text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:ring-4 focus:ring-orange-500/20 transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center gap-2 justify-center shrink-0"
          >
            {savingComment ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Guardando...
              </>
            ) : (
              "Guardar Comentario"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
