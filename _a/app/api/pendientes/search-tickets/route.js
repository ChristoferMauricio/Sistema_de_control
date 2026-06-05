/**
 * @file app/api/pendientes/search-tickets/route.js
 * @description API Route para buscar tickets de Jira por coincidencia parcial
 *              de la clave (jira_key). Retorna hasta 8 resultados.
 *
 * Método: GET
 * Query params: q (requerido) - texto a buscar (ej: "PF3QA-93")
 *
 * Respuesta: { data: [{ jira_key, summary }] }
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const supabase = createServiceClient();

    // Búsqueda por coincidencia parcial (case-insensitive) en jira_key
    const { data, error } = await supabase
      .from("jira_tickets")
      .select("jira_key, summary")
      .ilike("jira_key", `%${query}%`)
      .is("deleted_at", null)
      .order("jira_key", { ascending: true })
      .limit(8);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
