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
