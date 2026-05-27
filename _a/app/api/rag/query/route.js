import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getEmbedding, generateRAGResponse } from "@/lib/gemini";

/**
 * @file api/rag/query/route.js
 * @description Endpoint serverless que recibe una pregunta, genera su embedding,
 *              ejecuta la búsqueda semántica e inyecta el contexto obtenido a Gemini.
 *              Además, de manera híbrida e inteligente, consulta en tiempo real las tablas
 *              relacionales de Jira (jira_tickets) para proveer datos exactos de tickets y épicas
 *              sin necesidad de subir documentos previos, utilizando createServiceClient para omitir RLS.
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

    let contextText = "";
    const references = [];

    // 1. Crear el cliente de servicio para omitir RLS en el servidor
    const supabaseAdmin = createServiceClient();

    // ──────────────────────────────────────────────────────────────────────────
    // 2. RECUPERACIÓN DIRECTA DE DATOS DE JIRA DESDE SUPABASE (HÍBRIDO RELACIONAL)
    // ──────────────────────────────────────────────────────────────────────────
    let jiraContextText = "";

    // A. Si se seleccionó una Épica específica en el frontend
    if (epicKey) {
      console.log(`[RAG Query] Obteniendo contexto directo para la Épica: ${epicKey}`);
      
      // Consultar el ticket de la Épica en sí
      const { data: epicTicket } = await supabaseAdmin
        .from("jira_tickets")
        .select("*")
        .eq("jira_key", epicKey)
        .maybeSingle();

      // Consultar todos los tickets asociados a esta Épica (parent_key = epicKey)
      const { data: childTickets } = await supabaseAdmin
        .from("jira_tickets")
        .select("*")
        .eq("parent_key", epicKey)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (epicTicket || (childTickets && childTickets.length > 0)) {
        jiraContextText += `\n=== INFORMACIÓN DE LA ÉPICA ACTIVA (${epicKey}) ===\n`;
        if (epicTicket) {
          jiraContextText += `Épica: [${epicTicket.jira_key}] ${epicTicket.summary}\n`;
          jiraContextText += `Estado: ${epicTicket.status} | Asignado: ${epicTicket.assignee_email || "Sin asignar"} | Prioridad: ${epicTicket.priority}\n`;
          jiraContextText += `Descripción: ${epicTicket.description || "Sin descripción disponible."}\n\n`;
        }

        if (childTickets && childTickets.length > 0) {
          jiraContextText += `Tareas y Tickets asociados a esta Épica (${childTickets.length} tickets):\n`;
          childTickets.forEach((t) => {
            jiraContextText += `- [${t.jira_key}] "${t.summary}" | Estado: ${t.status} | Asignado: ${t.assignee_email || "Sin asignar"} | Prioridad: ${t.priority} | Puntos de Historia: ${t.story_points ?? "No asignados"} | Labels: ${t.labels ? t.labels.join(", ") : "Ninguno"}\n`;
          });
          
          // Registrar como referencia citable en la interfaz
          references.push({
            key: `Tickets de la Épica ${epicKey} (Jira DB)`,
            sourceKey: epicKey,
            sourceType: "jira_ticket",
            similarity: 1.0 // Prioridad máxima por ser factual relacional
          });
        }
      }
    }

    // B. Detectar si el usuario menciona claves de tickets específicas en su pregunta (ej: "PF3-179")
    const keyRegex = /\b([A-Z0-9]+-[0-9]+)\b/gi;
    const mentionedKeys = [...new Set(query.match(keyRegex)?.map(k => k.toUpperCase()) || [])];

    // Evitar consultar de nuevo la misma epicKey si ya se consultó
    const keysToQuery = mentionedKeys.filter(k => k !== epicKey);

    if (keysToQuery.length > 0) {
      console.log(`[RAG Query] Claves de tickets detectadas en la consulta: ${keysToQuery.join(", ")}`);
      const { data: directTickets } = await supabaseAdmin
        .from("jira_tickets")
        .select("*")
        .in("jira_key", keysToQuery)
        .is("deleted_at", null);

      if (directTickets && directTickets.length > 0) {
        jiraContextText += `\n=== TICKETS ESPECÍFICOS CONSULTADOS ===\n`;
        directTickets.forEach(t => {
          jiraContextText += `Ticket: [${t.jira_key}] "${t.summary}"\n`;
          jiraContextText += `Estado: ${t.status} | Asignado a: ${t.assignee_email || "Sin asignar"} | Prioridad: ${t.priority} | Puntos de Historia: ${t.story_points ?? "No asignado"}\n`;
          jiraContextText += `Descripción: ${t.description || "Sin descripción disponible."}\n`;
          if (t.parent_key) jiraContextText += `Pertenece a la Épica/Padre: ${t.parent_key}\n`;
          jiraContextText += `Labels: ${t.labels ? t.labels.join(", ") : "Ninguno"}\n\n`;

          // Registrar como referencia
          references.push({
            key: `Ticket ${t.jira_key} (Jira DB)`,
            sourceKey: t.jira_key,
            sourceType: "jira_ticket",
            similarity: 0.95
          });
        });
      }
    }

    // D. Detectar si el usuario consulta por un Sprint específico (ej: "sprint 14" o "sprint 2")
    const sprintRegex = /sprint\s*(\d+)/i;
    const sprintMatch = query.match(sprintRegex);
    if (sprintMatch) {
      const sprintNum = sprintMatch[1];
      console.log(`[RAG Query] Consulta por Sprint detectada: ${sprintNum}`);
      
      const { data: sprintTickets } = await supabaseAdmin
        .from("jira_tickets")
        .select("jira_key, summary, status, assignee_email, priority, issue_type, parent_key, sprint, description")
        .ilike("sprint", `%${sprintNum}%`)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(30);

      if (sprintTickets && sprintTickets.length > 0) {
        jiraContextText += `\n=== TICKETS DEL SPRINT/ITERACIÓN QUE CONTIENE "${sprintNum}" (${sprintTickets.length} tickets) ===\n`;
        sprintTickets.forEach(t => {
          jiraContextText += `- [${t.jira_key}] "${t.summary}" (${t.issue_type}) | Estado: ${t.status} | Asignado: ${t.assignee_email || "Sin asignar"} | Sprint: ${t.sprint || "Ninguno"}\n`;
          if (t.description) jiraContextText += `  Descripción del ticket: ${t.description.substring(0, 300)}${t.description.length > 300 ? '...' : ''}\n`;
        });
        
        references.push({
          key: `Tickets del Sprint ${sprintNum} (Jira DB)`,
          sourceKey: `Sprint ${sprintNum}`,
          sourceType: "jira_ticket",
          similarity: 0.98
        });
      }
    }

    // C. Si la consulta es "Global" (sin epicKey seleccionada) y no se mencionan claves específicas,
    //    inyectamos un resumen del estado actual de los tickets más recientes para dar contexto general.
    if (!epicKey && keysToQuery.length === 0 && !sprintMatch) {
      console.log(`[RAG Query] Consulta global, inyectando resumen relacional de tickets activos.`);
      const { data: recentTickets } = await supabaseAdmin
        .from("jira_tickets")
        .select("jira_key, summary, status, assignee_email, priority, issue_type, parent_key")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(15);

      if (recentTickets && recentTickets.length > 0) {
        jiraContextText += `\n=== RESUMEN DE TICKETS ACTIVOS Y RECIENTES EN EL TRABAJO ===\n`;
        recentTickets.forEach(t => {
          jiraContextText += `- [${t.jira_key}] "${t.summary}" (${t.issue_type}) | Estado: ${t.status} | Asignado: ${t.assignee_email || "Sin asignar"} | Épica: ${t.parent_key || "Ninguna"}\n`;
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. BÚSQUEDA SEMÁNTICA VECTORIAL (RAG SOBRE DOCUMENTOS SUBIDOS)
    // ──────────────────────────────────────────────────────────────────────────
    let vectorContextText = "";
    
    try {
      // Generar el embedding de la pregunta mediante la API de Gemini (rápido)
      const queryVector = await getEmbedding(query);

      // Ejecutar la búsqueda semántica llamando a la función RPC 'match_documentos' en Supabase
      const { data: matches, error: rpcError } = await supabaseAdmin.rpc("match_documentos", {
        query_embedding: queryVector,
        match_threshold: 0.35, // Umbral mínimo de similitud
        match_count: 8,        // Traer los 8 fragmentos más relevantes
        filter_epic_key: epicKey || null
      });

      if (!rpcError && matches && matches.length > 0) {
        matches.forEach((match, index) => {
          vectorContextText += `\n[Fragmento Documento ${index + 1} | Fuente: ${match.source_key} | Similitud: ${(match.similarity * 100).toFixed(1)}%]\n`;
          vectorContextText += `${match.content}\n`;
          
          const refKey = `${match.source_key} (Archivo)`;
          if (!references.some(r => r.key === refKey)) {
            references.push({
              key: refKey,
              sourceKey: match.source_key,
              sourceType: match.source_type,
              similarity: match.similarity
            });
          }
        });
      }
    } catch (embErr) {
      console.warn("[RAG Query] Advertencia: No se pudieron recuperar embeddings (posible tabla vacía o sin archivos):", embErr.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. INTEGRAR AMBOS CONTEXTOS (RELACIONAL + VECTORIAL)
    // ──────────────────────────────────────────────────────────────────────────
    contextText = "";
    if (jiraContextText) {
      contextText += `--- DATOS DE JIRA (BASE DE DATOS DIRECTA) ---\n${jiraContextText}\n`;
    }
    if (vectorContextText) {
      contextText += `--- ESPECIFICACIONES Y DOCUMENTOS SUBIDOS (SEMÁNTICA) ---\n${vectorContextText}\n`;
    }

    if (!contextText) {
      contextText = "No se encontraron tickets en esta épica ni documentos de contexto cargados en la base de datos.";
    }

    // 4. Formatear el historial de chat anterior
    let conversationHistoryText = "";
    if (history && history.length > 0) {
      conversationHistoryText = "\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n";
      history.slice(-6).forEach(msg => {
        const roleName = msg.role === "user" ? "Usuario" : "Asistente IA";
        conversationHistoryText += `${roleName}: ${msg.content}\n`;
      });
    }

    // 5. Construir el System Prompt estructurado inyectando el contexto
    const prompt = `
Eres Antigravity, un asistente experto en Inteligencia Artificial e Ingeniería de Software integrado en el Dashboard del Gestor Jira de la empresa.
Tu objetivo es responder de manera precisa, útil y estructurada a las preguntas del usuario basándote tanto en la información directa de los tickets de Jira como en la documentación cargada (si la hubiera).

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. Responde basándote en los "DATOS DE JIRA" y "DOCUMENTOS" inyectados abajo. Prioriza siempre los datos directos de Jira para preguntas sobre estados, responsables, prioridades, tareas, etc.
2. Si te preguntan sobre quién tiene asignada una tarea, cuál es el estado de una épica o una lista de tareas, elabora una respuesta clara basada en los datos estructurados provistos (por ejemplo, puedes armar tablas o listas markdown).
3. Si el usuario te hace preguntas generales o relativas al Jira, y la información está disponible en el resumen de tickets inyectado, responde con ella.
4. Sé profesional, directo y ordenado. Utiliza Markdown limpio (tablas, negritas, listas ordenadas).
5. Cita siempre tus fuentes en la respuesta. Si utilizas datos de un ticket de Jira, menciona el código (ej: "[PF3-1799]"). Si utilizas datos de un fragmento de documento, cita el nombre del archivo.
6. NUNCA inventes claves de tickets, nombres de personas o fechas que no estén presentes en el contexto.

${conversationHistoryText}

CONTEXTO E INFORMACIÓN RECUPERADA EN TIEMPO REAL:
======================================================================
${contextText}
======================================================================

PREGUNTA DEL USUARIO A RESPONDER:
"${query}"

RESPUESTA DETALLADA (en español):
`;

    // 6. Enviar el prompt enriquecido al LLM Gemini 2.5 Flash (súper veloz, preciso y con amplio contexto)
    const textResponse = await generateRAGResponse(prompt);

    // 7. Retornar la respuesta final e incluir las referencias
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
