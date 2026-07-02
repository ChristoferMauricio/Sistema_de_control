/**
 * @file app/api/correos-pendientes/historial/route.js
 * @description Devuelve el historial de trazabilidad de un recuadro del tablero
 *              "Correos pendientes": creación, subidas/reemplazos de imagen
 *              (con las URLs de las versiones anteriores, que se conservan en
 *              Storage), ediciones de título y eliminación.
 *
 * GET ?correo_id=N  →  { data: [...] } ordenado del más reciente al más antiguo
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const correoId = searchParams.get("correo_id");

    if (!correoId) {
      return NextResponse.json({ error: "correo_id es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("correos_pendientes_historial")
      .select("*")
      .eq("correo_id", correoId)
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
