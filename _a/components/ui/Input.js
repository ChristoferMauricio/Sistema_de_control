/**
 * @file Input.js
 * @description Componente de campo de texto reutilizable con soporte para label, validacion
 *   visual de errores y estilos consistentes del sistema de disenio.
 */

/**
 * Campo de entrada de texto con label opcional y mensaje de error.
 * @param {Object}  props
 * @param {string}  [props.label]         - Texto del label asociado al input
 * @param {string}  [props.id]            - ID del input (se vincula con el label via htmlFor)
 * @param {string}  [props.error]         - Mensaje de error (resalta el borde en rojo y muestra el texto)
 * @param {string}  [props.className=""]  - Clases CSS adicionales para el input
 * @param {Object}  props....props        - Props adicionales pasados al elemento <input> (type, placeholder, value, onChange, etc.)
 */
export default function Input({
  label,
  id,
  error,
  className = "",
  ...props
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`
          w-full px-4 py-3 rounded-xl
          bg-white border border-gray-200
          text-gray-900 placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40
          transition-all duration-200
          ${error ? "border-red-400 focus:ring-red-500/40" : ""}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
