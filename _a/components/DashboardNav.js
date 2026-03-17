"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getInitials } from "@/lib/utils";
import { useTheme } from "@/app/dashboard/ThemeContext";

// Configuración de navegación con permisos por rol
const navItems = [
  {
    label: "Vista General",
    href: "/dashboard",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Cronograma de Sprints",
    href: "/dashboard/cronograma",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Mis Pendientes",
    href: "/dashboard/mis-pendientes",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Errores",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
    subItems: [
      {
        label: "Errores Certificación",
        href: "/dashboard/errores-certificacion",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
      {
        label: "Errores Desarrollo",
        href: "/dashboard/errores-desarrollo",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 011.789 1.106l1.5 3a2 2 0 01-1.789 2.894zM16 17v5m-4-2.5h8" />
          </svg>
        ),
      }
    ]
  },
  {
    label: "Observ. del Supervisor",
    href: "/dashboard/obs",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Reuniones",
    href: "/dashboard/reuniones",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Información",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
    subItems: [
      {
        label: "Equipo de Desarrollo",
        href: "/dashboard/equipo",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        label: "Información GSM",
        href: "/dashboard/gsm",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        ),
      },
    ]
  },
  {
    label: "Incidencias",
    href: "/dashboard/incidencias",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
  {
    label: "Reportes",
    href: "/dashboard/reportes",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    roles: ["admin", "developer", "qa", "viewer"],
  },
];

export default function DashboardNav({ user, role }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  
  // By default expand drops if child path is active
  const [openDropdowns, setOpenDropdowns] = useState(() => {
    const drops = {};
    navItems.forEach(item => {
      if (item.subItems && item.subItems.some(sub => sub.href === pathname)) {
        drops[item.label] = true;
      }
    });
    return drops;
  });

  const [counts, setCounts] = useState({
    certificacion: 0,
    desarrollo: 0,
    observaciones: 0
  });

  const toggleDropdown = (label) => {
    setOpenDropdowns(prev => ({ ...prev, [label]: !prev[label] }));
  };

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [
          { count: countCert },
          { count: countDes },
          { data: obsData }
        ] = await Promise.all([
          supabase
            .from("jira_tickets")
            .select("*", { count: "exact", head: true })
            .in("issue_type", ["Historia", "Story"])
            .eq("parent_key", "PF3QA-49"),
          supabase
            .from("jira_tickets")
            .select("*", { count: "exact", head: true })
            .in("issue_type", ["Historia", "Story"])
            .eq("parent_key", "PF3QA-50"),
          supabase
            .from("jira_tickets")
            .select("comentario")
            .not("comentario", "is", null)
            .neq("comentario", "")
        ]);

        const countObs = (obsData || []).filter(t => t.comentario && t.comentario.trim().length > 0).length;

        setCounts({
          certificacion: countCert || 0,
          desarrollo: countDes || 0,
          observaciones: countObs || 0
        });
      } catch (err) {
        console.error("Error fetching nav counts:", err);
      }
    }
    fetchCounts();
  }, []);

  // Filtrar por rol
  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || userEmail.split("@")[0];

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
        aria-label="Menú"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-72 flex flex-col
          bg-white border-r border-gray-200 shadow-sm
          transition-transform duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo area */}
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center ring-1 ring-orange-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold font-[family-name:var(--font-heading)] text-gray-900">
                Jira Dashboard
              </h2>
              <p className="text-xs text-gray-400">Panel de gestión</p>
            </div>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-500 transition-all duration-200"
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? (
                <svg key="sun" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 theme-icon-enter" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg key="moon" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 theme-icon-enter" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Navegación
          </p>
          {visibleItems.map((item, index) => {
            const hasSubmenu = !!item.subItems;
            const isChildActive = hasSubmenu && item.subItems.some(sub => sub.href === pathname);
            const isActive = pathname === item.href || isChildActive;

            let badgeCount = null;
            if (item.label === "Errores Certificación") badgeCount = counts.certificacion;
            if (item.label === "Errores Desarrollo") badgeCount = counts.desarrollo;
            if (item.label === "Observ. del Supervisor") badgeCount = counts.observaciones;

            // Render Subitem Parent Toggle Structure
            if (hasSubmenu) {
              const isOpen = openDropdowns[item.label];
              
              // Custom parent badges for Errores
              let parentBadges = null;
              if (item.label === "Errores") {
                const hasCert = counts.certificacion > 0;
                const hasDes = counts.desarrollo > 0;
                
                if (hasCert || hasDes) {
                  parentBadges = (
                    <div className="flex gap-1.5">
                      {hasCert && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${
                          isActive ? "bg-red-100 text-red-700 border-red-200" : "bg-red-50 text-red-600 border-red-100"
                        }`}>
                          Cert {counts.certificacion}
                        </span>
                      )}
                      {hasDes && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${
                          isActive ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-amber-50 text-amber-600 border-amber-100"
                        }`}>
                          Desa {counts.desarrollo}
                        </span>
                      )}
                    </div>
                  );
                }
              }

              return (
                <div key={item.label} className={`group animate-slide-left stagger-${index + 1}`}>
                  <button
                    onClick={() => toggleDropdown(item.label)}
                    className={`
                      w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
                      transition-all duration-200
                      ${isActive 
                        ? "bg-orange-50 text-orange-600 shadow-sm"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`${isActive ? "text-orange-500" : "text-gray-400 group-hover:text-gray-600"} transition-colors`}>
                        {item.icon}
                      </span>
                      {item.label}
                    </div>
                    <div className="flex items-center gap-2">
                      {parentBadges}
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* Dropdown Content */}
                  {isOpen && (
                    <div className="pl-9 mt-1 space-y-1">
                      {item.subItems.map((sub, childIndex) => {
                        const isSubActive = pathname === sub.href;
                        
                        let subBadgeCount = null;
                        if (sub.label === "Errores Certificación") subBadgeCount = counts.certificacion;
                        if (sub.label === "Errores Desarrollo") subBadgeCount = counts.desarrollo;

                        return (
                          <a
                            key={sub.href}
                            href={sub.href}
                            onClick={(e) => {
                              e.preventDefault();
                              router.push(sub.href);
                              setMobileOpen(false);
                            }}
                            className={`
                              flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                              ${isSubActive 
                                ? "text-orange-600 bg-orange-50" 
                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50/80"
                              }
                            `}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className={`${isSubActive ? "text-orange-500" : "text-gray-400"} transition-colors`}>
                                {sub.icon}
                              </span>
                              {sub.label}
                            </div>
                            
                            {subBadgeCount !== null && subBadgeCount > 0 && (
                              <span className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                                isSubActive 
                                  ? (sub.label === "Errores Certificación" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200")
                                  : (sub.label === "Errores Certificación" ? "bg-red-50 text-red-600 border-red-100" : "bg-amber-50 text-amber-600 border-amber-100")
                              }`}>
                                {subBadgeCount}
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Normal Item Render
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(item.href);
                  setMobileOpen(false);
                }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group
                  animate-slide-left stagger-${index + 1}
                  ${isActive
                    ? "bg-orange-50 text-orange-600 border border-orange-200 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"
                  }
                `}
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className={`${isActive ? "text-orange-500" : "text-gray-400 group-hover:text-gray-600"} transition-colors`}>
                    {item.icon}
                  </span>
                  {item.label}
                </div>
                
                {badgeCount !== null && badgeCount > 0 && (
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                    isActive 
                      ? "bg-orange-100 text-orange-700 border-orange-200" 
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {badgeCount}
                  </span>
                )}

                {isActive && badgeCount === null && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500" />
                )}
              </a>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-sm font-semibold text-orange-600">
              {getInitials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {userName}
              </p>
              <p className="text-xs text-gray-400 truncate">{userEmail}</p>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-md bg-orange-50 text-orange-600 border border-orange-200">
              {role}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 border border-transparent hover:border-red-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
