export default function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  ...props
}) {
  const variants = {
    primary:
      "bg-primary hover:bg-primary-dark text-white shadow-md hover:shadow-lg hover:shadow-primary/25",
    secondary:
      "bg-elevated hover:bg-slate-700 text-secondary-text hover:text-foreground border border-border",
    danger:
      "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20",
    ghost:
      "bg-transparent hover:bg-elevated text-secondary-text hover:text-foreground",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-xl",
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
