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
