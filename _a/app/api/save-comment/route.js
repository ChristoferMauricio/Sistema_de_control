/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: app/api/save-comment/route.js
 * Descripcion: API Route de Next.js para guardar comentarios en tickets de Jira.
 *
 * Este endpoint permite actualizar el campo "comentario" de un ticket
 * en la tabla jira_tickets de Supabase. Es utilizado desde la UI cuando
 * un usuario agrega o edita un comentario interno sobre un ticket.
 *
 * Metodo: POST
 * Body esperado (JSON):
 *   - jira_key {string} (requerido): Clave del ticket Jira (ej: "PGIM-123")
 *   - comentario {string} (opcional): Texto del comentario. Si es vacio o null,
 *     se limpia el comentario existente.
 *
 * Respuestas:
 *   - 200: { success: true, data: { jira_key, comentario } }
 *   - 400: { error: "jira_key es requerido" } si falta la clave del ticket
 *   - 500: { error: "mensaje" } si ocurre un error en Supabase o en el servidor
 *
 * Usa el cliente de servicio (service role) de Supabase para tener acceso
 * de escritura sin restricciones de RLS.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * Handler POST: Guarda o actualiza el comentario de un ticket Jira en Supabase.
 *
 * Flujo:
 *   1. Extraer jira_key y comentario del cuerpo JSON de la peticion
 *   2. Validar que jira_key este presente
 *   3. Crear un cliente de Supabase con permisos de servicio
 *   4. Actualizar el campo "comentario" del ticket identificado por jira_key
 *   5. Retornar los datos actualizados o un error
 *
 * @param {Request} request - Objeto Request con el cuerpo JSON de la peticion
 * @returns {Promise<NextResponse>} Respuesta JSON con el resultado de la operacion
 */
export async function POST(request) {
  try {
    // Extraer los datos del cuerpo de la peticion
    const { jira_key, comentario } = await request.json();

    // Validar que se proporcione la clave del ticket (campo obligatorio)
    if (!jira_key) {
      return NextResponse.json({ error: "jira_key es requerido" }, { status: 400 });
    }

    // Crear cliente de Supabase con permisos de servicio (sin restricciones RLS)
    const supabase = createServiceClient();

    // Actualizar el campo "comentario" del ticket en la base de datos.
    // Si el comentario es null/undefined, se guarda como cadena vacia.
    // .single() asegura que solo se actualice exactamente un registro.
    const { data, error } = await supabase
      .from("jira_tickets")
      .update({ comentario: comentario || "" })
      .eq("jira_key", jira_key)
      .select("jira_key, comentario")
      .single();

    // Manejar errores de Supabase (ej: ticket no encontrado, error de conexion)
    if (error) {
      console.error("Error updating comentario:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Retornar la confirmacion con los datos actualizados
    return NextResponse.json({ success: true, data });
  } catch (err) {
    // Manejar errores inesperados (ej: JSON invalido, errores de red)
    console.error("save-comment API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
