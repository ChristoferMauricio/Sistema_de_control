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
      "bg-orange-500 hover:bg-orange-600 text-white shadow-md hover:shadow-lg hover:shadow-orange-500/20",
    secondary:
      "bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200",
    danger:
      "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200",
    ghost:
      "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-gray-900",
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
