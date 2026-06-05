/**
 * @file app/api/pendientes/ticket-statuses/route.js
 * @description API Route para consultar los estados actuales de un listado de keys de Jira
 *              en la tabla "jira_tickets".
 *
 * Método: POST
 * Body esperado (JSON): { keys: ["PF3QA-93", "PF3-120"] }
 *
 * Respuesta: { data: { "PF3QA-93": "In Progress", "PF3-120": "Done" } }
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request) {
  try {
    const body = await request.json();
    const { keys } = body;

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ data: {} });
    }

    const supabase = createServiceClient();

    // Consultar los estados de todos los tickets solicitados
    const { data, error } = await supabase
      .from("jira_tickets")
      .select("jira_key, status")
      .in("jira_key", keys)
      .is("deleted_at", null);

    if (error) {
      console.error("Error fetching ticket statuses:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convertir a un mapa/diccionario para fácil acceso en el frontend
    const statuses = {};
    if (data) {
      data.forEach((item) => {
        if (item.jira_key && item.status) {
          statuses[item.jira_key] = item.status;
        }
      });
    }

    return NextResponse.json({ data: statuses });
  } catch (err) {
    console.error("ticket-statuses POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
