"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNav from "@/components/DashboardNav";
import { RoleProvider } from "./RoleContext";
import { ThemeProvider } from "./ThemeContext";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      // Obtener rol del usuario
      const { data: roleData, error: roleError } = await supabase
        .from("team_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (roleError) {
        console.warn("Error obteniendo rol por user_id:", roleError.message);
        // Fallback: buscar por email
        const { data: roleByEmail } = await supabase
          .from("team_roles")
          .select("role")
          .eq("email", session.user.email)
          .single();

        if (roleByEmail) {
          console.log("Rol encontrado por email:", roleByEmail.role);
          setRole(roleByEmail.role);
        } else {
          console.warn("No se encontró rol para:", session.user.email);
          setRole("viewer");
        }
      } else {
        setRole(roleData?.role || "viewer");
      }

      setLoading(false);
    }

    checkSession();

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session) {
          router.replace("/login");
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <RoleProvider role={role}>
        <div className="min-h-screen flex bg-gray-50">
          {/* Sidebar Navigation */}
          <DashboardNav user={user} role={role} />

          {/* Main Content */}
          <main className="flex-1 lg:ml-72 min-h-screen">
            <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </RoleProvider>
    </ThemeProvider>
  );
}
