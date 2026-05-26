import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEmbedding, generateRAGResponse } from "@/lib/gemini";

/**
 * @file api/rag/query/route.js
 * @description Endpoint serverless que recibe una pregunta, genera su embedding,
 *              ejecuta la búsqueda semántica e inyecta el contexto obtenido a Gemini
 *              para retornar una respuesta contextualizada (RAG).
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { query, epicKey = null, history = [] } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Se requiere un parámetro 'query' de texto válido." },
        { status: 400 }
      );
    }

    console.log(`[RAG Query] Procesando consulta: "${query.substring(0, 60)}..." (Contexto Épica: ${epicKey || "Global"})`);

    // 1. Generar el embedding de la pregunta mediante la API de Gemini
    const queryVector = await getEmbedding(query);

    // 2. Ejecutar la búsqueda semántica llamando a la función RPC 'match_documentos' en Supabase
    //    Esta función calcula la similitud de coseno y filtra opcionalmente por la Épica.
    const { data: matches, error } = await supabase.rpc("match_documentos", {
      query_embedding: queryVector,
      match_threshold: 0.35, // Umbral mínimo de similitud de coseno
      match_count: 8,        // Traer los 8 fragmentos más relevantes
      filter_epic_key: epicKey || null
    });

    if (error) {
      console.error("[RAG Query] Error al ejecutar match_documentos RPC:", error);
      return NextResponse.json(
        { error: `Error en la base de datos: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[RAG Query] Búsqueda semántica retornó ${matches?.length || 0} fragmentos relevantes.`);

    // 3. Formatear los fragmentos de contexto y recopilar las referencias citables
    let contextText = "";
    const references = [];

    if (matches && matches.length > 0) {
      matches.forEach((match, index) => {
        contextText += `\n[Fragmento ${index + 1} | Fuente: ${match.source_key} (${match.source_type}) | Similitud: ${(match.similarity * 100).toFixed(1)}%]\n`;
        contextText += `${match.content}\n`;
        
        // Agregar a la lista de referencias sin duplicados
        const refKey = `${match.source_key} (${match.source_type === "jira_ticket" ? "Ticket Jira" : "Archivo"})`;
        if (!references.some(r => r.key === refKey)) {
          references.push({
            key: refKey,
            sourceKey: match.source_key,
            sourceType: match.source_type,
            similarity: match.similarity
          });
        }
      });
    } else {
      contextText = "No se encontraron fragmentos de contexto relevantes en la base de datos vectorial.";
    }

    // 4. Formatear el historial de chat anterior para mantener el hilo de la conversación
    let conversationHistoryText = "";
    if (history && history.length > 0) {
      conversationHistoryText = "\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n";
      history.slice(-6).forEach(msg => {
        const roleName = msg.role === "user" ? "Usuario" : "Asistente IA";
        conversationHistoryText += `${roleName}: ${msg.content}\n`;
      });
    }

    // 5. Construir el System Prompt estructurado inyectando el contexto y el historial
    const prompt = `
Eres Antigravity, un asistente experto en Inteligencia Artificial e Ingeniería de Software integrado en el Dashboard del Gestor Jira.
Tu objetivo es responder de manera precisa y objetiva a las preguntas del usuario utilizando ÚNICAMENTE el contexto e historial provistos a continuación.

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. Responde basándote estrictamente en los "FRAGMENTOS DE CONTEXTO" e "HISTORIAL" inyectados abajo.
2. Si la respuesta no se encuentra en el contexto provisto, di con amabilidad: "No dispongo de suficiente información en los documentos cargados o en los tickets de esta Épica para responder a tu pregunta."
3. Sé profesional, directo y estructurado en tu respuesta. Utiliza formato Markdown limpio (listas, negritas, tablas de ser necesario).
4. Cita siempre tus fuentes en la respuesta cuando uses información de un fragmento. Por ejemplo, al final de un dato, agrega un número de referencia o el nombre de la fuente: "[Fuente: PF3-1799]".
5. NUNCA inventes claves de tickets, nombres de personas o fechas que no estén presentes en el contexto de abajo.

${conversationHistoryText}

FRAGMENTOS DE CONTEXTO RELEVANTES RECUPERADOS:
=========================================
${contextText}
=========================================

PREGUNTA DEL USUARIO A RESPONDER:
"${query}"

RESPUESTA DETALLADA (en español):
`;

    // 6. Enviar el prompt enriquecido al LLM Gemini 1.5 Flash (súper veloz y preciso)
    const textResponse = await generateRAGResponse(prompt);

    // 7. Retornar la respuesta final e incluir las referencias para renderizar badges cliqueables en la UI
    return NextResponse.json({
      response: textResponse,
      references: references.sort((a, b) => b.similarity - a.similarity)
    });

  } catch (err) {
    console.error("[RAG Query] Error crítico en api/rag/query:", err);
    return NextResponse.json(
      { error: err.message || "Error interno del servidor en la consulta RAG." },
      { status: 500 }
    );
  }
}
