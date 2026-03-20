/**
 * @file Card.js
 * @description Componente de tarjeta (card) reutilizable. Contenedor visual con bordes redondeados,
 *   sombra y opciones de hover interactivo y efecto glow (resplandor naranja).
 */

/**
 * Contenedor tipo tarjeta con bordes, sombra y efectos interactivos opcionales.
 * @param {Object}  props
 * @param {React.ReactNode} props.children     - Contenido de la tarjeta
 * @param {string}  [props.className=""]       - Clases CSS adicionales
 * @param {boolean} [props.hover=false]        - Activa efecto hover (sombra y borde mas visible, cursor pointer)
 * @param {boolean} [props.glow=false]         - Activa efecto glow naranja al pasar el cursor
 * @param {Object}  props....props             - Props adicionales pasados al elemento <div>
 */
export default function Card({
  children,
  className = "",
  hover = false,
  glow = false,
  ...props
}) {
  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border border-gray-200
        shadow-sm
        ${hover ? "hover:shadow-md hover:border-gray-300 cursor-pointer" : ""}
        ${glow ? "hover:shadow-lg hover:shadow-orange-500/5" : ""}
        transition-all duration-300
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
