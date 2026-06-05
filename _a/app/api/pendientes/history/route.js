/**
 * @file app/api/pendientes/history/route.js
 * @description API Route para obtener el historial de asuntos de un pendiente.
 *
 * Método: GET
 * Query params: pendiente_id (requerido)
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pendienteId = searchParams.get("pendiente_id");

    if (!pendienteId) {
      return NextResponse.json({ error: "pendiente_id es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pendiente_asunto_history")
      .select("*")
      .eq("pendiente_id", parseInt(pendienteId))
      .order("changed_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
