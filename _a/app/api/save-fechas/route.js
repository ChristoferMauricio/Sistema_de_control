/**
 * API Route para guardar y editar las fechas customizadas (Fecha Inicio, Fecha Solucion)
 * de los tickets Jira directamente sobre Supabase.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request) {
  try {
    const { jira_key, fecha_inicio, fecha_solucion } = await request.json();

    if (!jira_key) {
      return NextResponse.json({ error: "jira_key es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const updateData = {};
    if (fecha_inicio !== undefined) updateData.fecha_inicio = fecha_inicio || null;
    if (fecha_solucion !== undefined) updateData.fecha_solucion = fecha_solucion || null;

    const { data, error } = await supabase
      .from("jira_tickets")
      .update(updateData)
      .eq("jira_key", jira_key)
      .select("jira_key, fecha_inicio, fecha_solucion")
      .single();

    if (error) {
      console.error("Error updating fechas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("save-fechas API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
