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
          className="block text-sm font-medium text-secondary-text"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={`
          w-full px-4 py-3 rounded-xl
          bg-elevated border border-border
          text-foreground placeholder-muted
          focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
          transition-all duration-200
          ${error ? "border-red-500/50 focus:ring-red-500/50" : ""}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
