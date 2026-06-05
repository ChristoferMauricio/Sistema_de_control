/**
 * @file app/api/pendientes/route.js
 * @description API Route para operaciones CRUD sobre la tabla "pendientes"
 *              y la tabla de historial de asuntos "pendiente_asunto_history".
 *
 * Usa el cliente de servicio (service role) de Supabase para tener acceso
 * de escritura sin restricciones de RLS.
 *
 * Métodos:
 *   GET    - Obtener todos los pendientes (con filtros opcionales)
 *   POST   - Crear un nuevo pendiente
 *   PUT    - Actualizar un pendiente existente
 *   DELETE - Eliminar un pendiente
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET: Obtener todos los pendientes, ordenados por fecha de creación descendente.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pendientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Crear un nuevo pendiente.
 * Body esperado: { asunto, seguimiento, responsables, estado, historias,
 *                  fecha_primer_correo, fecha_atencion, drive_link }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("pendientes")
      .insert({
        asunto: body.asunto,
        seguimiento: body.seguimiento || null,
        responsables: body.responsables || [],
        estado: body.estado || "Sin atender",
        historias: body.historias || [],
        fecha_primer_correo: body.fecha_primer_correo || null,
        fecha_atencion: body.fecha_atencion || null,
        drive_link: body.drive_link || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating pendiente:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Si hay asunto, registrar en historial
    if (body.asunto) {
      await supabase.from("pendiente_asunto_history").insert({
        pendiente_id: data.id,
        asunto_anterior: null,
        asunto_nuevo: body.asunto,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("pendientes POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT: Actualizar un pendiente existente.
 * Body esperado: { id, ...campos a actualizar }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Si el asunto cambió, registrar en historial
    if (updateFields.asunto !== undefined) {
      // Obtener el asunto actual antes de actualizar
      const { data: current } = await supabase
        .from("pendientes")
        .select("asunto")
        .eq("id", id)
        .single();

      if (current && current.asunto !== updateFields.asunto) {
        await supabase.from("pendiente_asunto_history").insert({
          pendiente_id: id,
          asunto_anterior: current.asunto,
          asunto_nuevo: updateFields.asunto,
        });
      }
    }

    const { data, error } = await supabase
      .from("pendientes")
      .update({
        ...updateFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating pendiente:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("pendientes PUT error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Eliminar un pendiente por id (query param).
 * URL: /api/pendientes?id=123
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("pendientes")
      .delete()
      .eq("id", parseInt(id));

    if (error) {
      console.error("Error deleting pendiente:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("pendientes DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
