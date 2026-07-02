/**
 * @file app/api/correos-pendientes/route.js
 * @description API Route para operaciones CRUD sobre la tabla "correos_pendientes"
 *              (recuadros del tablero de Correos pendientes) con registro de
 *              trazabilidad en "correos_pendientes_historial".
 *
 * Usa el cliente de servicio (service role) de Supabase para tener acceso
 * de escritura sin restricciones de RLS (mismo patrón que app/api/pendientes).
 *
 * Métodos:
 *   GET    - Obtener todos los recuadros activos (deleted_at IS NULL)
 *   POST   - Crear un nuevo recuadro vacío (registra 'creacion' en historial)
 *   PUT    - Actualizar el título de un recuadro (registra 'titulo_editado')
 *   DELETE - Eliminación suave de un recuadro (registra 'eliminacion')
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET: Obtener todos los recuadros activos, ordenados por orden y creación.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("correos_pendientes")
      .select("*")
      .is("deleted_at", null)
      .order("orden", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST: Crear un nuevo recuadro (vacío por defecto).
 * Body esperado: { titulo?, usuario? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("correos_pendientes")
      .insert({ titulo: body.titulo || "" })
      .select()
      .single();

    if (error) {
      console.error("Error creating correo pendiente:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Registrar la creación en el historial de trazabilidad
    await supabase.from("correos_pendientes_historial").insert({
      correo_id: data.id,
      accion: "creacion",
      titulo_nuevo: data.titulo,
      usuario: body.usuario || null,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("correos-pendientes POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Estados permitidos para un recuadro (mismo CHECK que la migración 009) */
const ESTADOS_VALIDOS = ["Pendiente", "En proceso o espera", "Finalizado o Atendido", "Falta respuesta"];

/**
 * PUT: Actualizar título, estado y/o detalle de un recuadro. Registra una fila
 * de historial por cada campo que realmente cambió. Para estado y detalle, las
 * columnas titulo_anterior/titulo_nuevo del historial actúan como
 * valor_anterior/valor_nuevo genéricos (ver migración 009).
 * Body esperado: { id, titulo?, estado?, detalle?, usuario? }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, titulo, estado, detalle, usuario } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }
    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado)) {
      return NextResponse.json({ error: `Estado inválido. Permitidos: ${ESTADOS_VALIDOS.join(", ")}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Obtener los valores actuales antes de actualizar (para el historial)
    const { data: current, error: currentError } = await supabase
      .from("correos_pendientes")
      .select("titulo, estado, detalle")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (currentError || !current) {
      return NextResponse.json({ error: "Recuadro no encontrado" }, { status: 404 });
    }

    // Construir solo los campos enviados
    const updates = { updated_at: new Date().toISOString() };
    if (titulo !== undefined) updates.titulo = titulo ?? "";
    if (estado !== undefined) updates.estado = estado;
    if (detalle !== undefined) updates.detalle = detalle ?? "";

    const { data, error } = await supabase
      .from("correos_pendientes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Registrar en historial cada campo que realmente cambió
    const historyRows = [];
    if (titulo !== undefined && current.titulo !== (titulo ?? "")) {
      historyRows.push({ accion: "titulo_editado", titulo_anterior: current.titulo, titulo_nuevo: titulo ?? "" });
    }
    if (estado !== undefined && current.estado !== estado) {
      historyRows.push({ accion: "estado_editado", titulo_anterior: current.estado, titulo_nuevo: estado });
    }
    if (detalle !== undefined && current.detalle !== (detalle ?? "")) {
      historyRows.push({ accion: "detalle_editado", titulo_anterior: current.detalle, titulo_nuevo: detalle ?? "" });
    }
    if (historyRows.length > 0) {
      await supabase.from("correos_pendientes_historial").insert(
        historyRows.map((row) => ({ ...row, correo_id: id, usuario: usuario || null }))
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("correos-pendientes PUT error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Eliminación suave (soft delete) de un recuadro.
 * La imagen y el historial se conservan para trazabilidad.
 * Body esperado: { id, usuario? }
 */
export async function DELETE(request) {
  try {
    const body = await request.json();
    const { id, usuario } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("correos_pendientes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Registrar la eliminación en el historial (se conserva por el soft delete)
    await supabase.from("correos_pendientes_historial").insert({
      correo_id: id,
      accion: "eliminacion",
      titulo_anterior: data.titulo,
      imagen_url_anterior: data.imagen_url,
      usuario: usuario || null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("correos-pendientes DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
