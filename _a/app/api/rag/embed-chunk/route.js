import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getEmbeddingsBatch } from "@/lib/gemini";

/**
 * @file api/rag/embed-chunk/route.js
 * @description Endpoint serverless para procesar y almacenar fragmentos (chunks)
 *              de texto con sus correspondientes vectores embeddings en Supabase.
 *              Soporta procesamiento secuencial por lotes para evitar límites de 10s de Vercel.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { chunks, sourceType, sourceKey, metadata = {} } = body;

    // Validar parámetros esenciales
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json(
        { error: "El cuerpo de la petición debe incluir un array 'chunks' no vacío." },
        { status: 400 }
      );
    }
    if (!sourceType || !sourceKey) {
      return NextResponse.json(
        { error: "Faltan los parámetros 'sourceType' o 'sourceKey' requeridos." },
        { status: 400 }
      );
    }

    console.log(`[RAG Ingestion] Procesando lote de ${chunks.length} chunks para '${sourceKey}' (${sourceType})...`);

    // 1. Obtener embeddings en lote a través de la API REST de Gemini (súper veloz)
    const vectors = await getEmbeddingsBatch(chunks);

    // 2. Conectar a Supabase mediante el cliente de servicio para omitir RLS de escritura
    const supabaseAdmin = createServiceClient();

    // 3. Preparar filas para inserción masiva (bulk insert)
    const rows = chunks.map((chunkText, i) => ({
      source_type: sourceType,
      source_key: sourceKey,
      content: chunkText,
      metadata: metadata,
      embedding: vectors[i],
    }));

    // 4. Inserción masiva en Supabase
    const { error } = await supabaseAdmin
      .from("documentos_embeddings")
      .insert(rows);

    if (error) {
      console.error("[RAG Ingestion] Error al insertar embeddings en Supabase:", error);
      return NextResponse.json(
        { error: `Error al almacenar en base de datos: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[RAG Ingestion] Lote de ${chunks.length} chunks guardado con éxito.`);

    return NextResponse.json({
      success: true,
      processed: chunks.length,
    });

  } catch (err) {
    console.error("[RAG Ingestion] Error crítico en api/rag/embed-chunk:", err);
    return NextResponse.json(
      { error: err.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
