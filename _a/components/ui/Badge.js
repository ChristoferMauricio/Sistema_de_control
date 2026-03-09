export default function Badge({ children, color = "default", className = "" }) {
  const colors = {
    default: "bg-gray-100 text-gray-600",
    primary: "bg-orange-50 text-orange-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
  };

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-1 rounded-lg
        text-xs font-medium
        ${colors[color] || colors.default}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
