export default function Badge({ children, color = "default", className = "" }) {
  const colors = {
    default: "bg-slate-500/20 text-slate-400",
    primary: "bg-primary/20 text-primary-light",
    success: "bg-emerald-500/20 text-emerald-400",
    warning: "bg-amber-500/20 text-amber-400",
    danger: "bg-red-500/20 text-red-400",
    info: "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400",
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
