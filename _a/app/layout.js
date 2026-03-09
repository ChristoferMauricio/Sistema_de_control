import "./globals.css";

export const metadata = {
  title: "Jira Dashboard | PGIM",
  description: "Dashboard de gestión de tickets Jira con vistas personalizadas, roles de usuario y sincronización automática.",
  keywords: ["Jira", "Dashboard", "Gestión", "Tickets", "PGIM"],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
