/**
 * @file app/api/correos-pendientes/upload/route.js
 * @description Sube una imagen (pegada con Ctrl+V, arrastrada o seleccionada) al
 *              bucket "correos-pendientes" de Supabase Storage y la asocia a un
 *              recuadro del tablero. Registra la acción en el historial:
 *                - 'imagen_subida'      si el recuadro no tenía imagen
 *                - 'imagen_reemplazada' si ya tenía una (la anterior NO se borra
 *                  del bucket, para conservar la trazabilidad de versiones)
 *
 * POST multipart/form-data:
 *   - file      {File}   (requerido): Imagen a subir (png, jpeg, gif, webp, bmp)
 *   - correo_id {string} (requerido): ID del recuadro destino
 *   - usuario   {string} (opcional):  Email del usuario que sube la imagen
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const BUCKET = "correos-pendientes";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB (igual al límite del bucket)
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"];

/** Mapea MIME type a extensión de archivo */
const EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const correoId = formData.get("correo_id");
    const usuario = formData.get("usuario") || null;

    // ─── Validaciones ───
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Falta el archivo de imagen" }, { status: 400 });
    }
    if (!correoId) {
      return NextResponse.json({ error: "correo_id es requerido" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Tipo de archivo no permitido: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen supera el límite de 10MB" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Obtener el recuadro actual (para saber si es subida nueva o reemplazo)
    const { data: card, error: cardError } = await supabase
      .from("correos_pendientes")
      .select("id, imagen_url, imagen_path")
      .eq("id", correoId)
      .is("deleted_at", null)
      .single();

    if (cardError || !card) {
      return NextResponse.json({ error: "Recuadro no encontrado" }, { status: 404 });
    }

    // ─── Subir a Storage ───
    // Ruta única por recuadro y timestamp: las versiones anteriores nunca se
    // sobrescriben ni se borran, para poder consultarlas desde el historial.
    const ext = EXT_BY_TYPE[file.type] || "png";
    const filePath = `correo_${card.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Error subiendo imagen a Storage:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    // ─── Actualizar el recuadro ───
    const { data: updated, error: updateError } = await supabase
      .from("correos_pendientes")
      .update({
        imagen_url: publicUrl,
        imagen_path: filePath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", card.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // ─── Registrar en historial de trazabilidad ───
    await supabase.from("correos_pendientes_historial").insert({
      correo_id: card.id,
      accion: card.imagen_url ? "imagen_reemplazada" : "imagen_subida",
      imagen_url_anterior: card.imagen_url,
      imagen_url_nueva: publicUrl,
      usuario,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("correos-pendientes upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
