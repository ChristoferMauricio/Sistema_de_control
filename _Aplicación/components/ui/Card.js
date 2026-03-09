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
        glass rounded-2xl p-6
        ${hover ? "glass-hover cursor-pointer" : ""}
        ${glow ? "hover:shadow-lg hover:shadow-primary/10" : ""}
        transition-all duration-300
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}
