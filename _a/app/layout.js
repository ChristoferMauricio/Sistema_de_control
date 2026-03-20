/**
 * @file layout.js - Layout raíz de la aplicación (Root Layout)
 * @description Define la estructura HTML base que envuelve todas las páginas de la aplicación.
 *              Es el punto de entrada del framework Next.js App Router. Importa los estilos
 *              globales y configura los metadatos SEO del sitio (título, descripción, keywords).
 *              Este layout se aplica a TODAS las rutas de la aplicación.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/pages-and-layouts#root-layout-required
 */

import "./globals.css";

/**
 * Metadatos globales de la aplicación para SEO y pestaña del navegador.
 * Next.js los inyecta automáticamente en el <head> de cada página.
 */
export const metadata = {
  title: "Jira Dashboard | PGIM",
  description: "Dashboard de gestión de tickets Jira con vistas personalizadas, roles de usuario y sincronización automática.",
  keywords: ["Jira", "Dashboard", "Gestión", "Tickets", "PGIM"],
};

/**
 * Layout raíz de la aplicación Next.js.
 * Renderiza la estructura HTML base con idioma español y estilos globales.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Contenido de la página actual (inyectado por Next.js)
 * @returns {JSX.Element} Estructura HTML raíz con <html> y <body>
 */
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
