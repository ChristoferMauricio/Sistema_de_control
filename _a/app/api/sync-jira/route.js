/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: app/api/sync-jira/route.js
 * Descripcion: API Route de Next.js para sincronizar tickets de Jira con Supabase.
 *
 * Esta ruta soporta dos formas de invocacion:
 *   - GET: Llamada automatica desde Vercel Cron Jobs (requiere CRON_SECRET)
 *   - POST: Llamada manual desde el boton de sincronizacion en la UI
 *
 * Flujo de sincronizacion:
 *   1. Descubrir dinamicamente el campo "Epic Link" en la instancia Jira
 *   2. Buscar todos los tickets del proyecto mediante la API de Jira (con paginacion)
 *   3. Transformar cada ticket en 4 entidades relacionales normalizadas
 *   4. Comparar estados actuales en Supabase para detectar cambios
 *   5. Hacer upsert de personas, tickets, subtareas y enlaces en Supabase
 *   6. Registrar cambios de estado en la tabla de historial
 *
 * Tablas de Supabase involucradas:
 *   - jira_persons: Personas (asignados, reporteros)
 *   - jira_tickets: Tickets de Jira normalizados
 *   - jira_ticket_subtasks: Relaciones padre-hijo entre tickets
 *   - jira_ticket_links: Enlaces entre tickets (bloquea, relacionado, etc.)
 *   - jira_ticket_status_history: Historial de cambios de estado
 *
 * Variables de entorno requeridas:
 *   - JIRA_BASE_URL: URL base de la instancia Jira (ej: https://miempresa.atlassian.net)
 *   - JIRA_USER_EMAIL: Email del usuario para autenticacion en Jira
 *   - JIRA_API_TOKEN: Token de API generado en Jira
 *   - JIRA_PROJECT_KEY: Clave(s) del proyecto (separadas por coma para multiples)
 *   - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto Supabase
 *   - SUPABASE_SERVICE_ROLE_KEY: Clave de servicio de Supabase
 *   - CRON_SECRET (opcional): Secreto para validar llamadas de Vercel Cron
 * ════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";

// ─── Configuracion de Variables de Entorno ──────────────────────────────────

/** URL base de Jira, con barras finales eliminadas para evitar doble barra en endpoints */
const JIRA_BASE_URL      = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
/** Email del usuario para autenticacion basica en la API de Jira */
const JIRA_USER_EMAIL    = process.env.JIRA_USER_EMAIL;
/** Token de API de Jira (se combina con el email para autenticacion Basic) */
const JIRA_API_TOKEN     = process.env.JIRA_API_TOKEN;
/** Clave(s) del proyecto Jira a sincronizar (separadas por coma si son multiples) */
const JIRA_PROJECT_KEY   = process.env.JIRA_PROJECT_KEY || "";
/** URL del proyecto Supabase */
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL;
/** Clave de servicio de Supabase (acceso completo sin RLS) */
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Cliente de Supabase con permisos administrativos para operaciones de escritura */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Headers HTTP para todas las peticiones a la API de Jira.
 * Usa autenticacion Basic con email:token codificado en Base64.
 */
const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * Tiempo maximo de ejecucion permitido para esta API route.
 * Vercel Hobby permite hasta 60 segundos; planes superiores permiten mas.
 * @type {number}
 */
export const maxDuration = 60;

// ─── Funciones Auxiliares (Helpers) ─────────────────────────────────────────

/**
 * Busca dinamicamente el ID del campo personalizado "Epic Link" en la instancia Jira.
 *
 * El nombre del campo varia segun la configuracion e idioma de la instancia:
 *   - "Epic Link" (ingles)
 *   - "Enlace de epica" / "Enlace epica" (espanol)
 *
 * El ID resultante tiene formato "customfield_XXXXX" (ej: "customfield_10014").
 *
 * @returns {Promise<string|null>} El ID del campo Epic Link, o null si no se encuentra
 */
async function getEpicLinkFieldId() {
  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/field`, {
      method: "GET",
      headers: jiraHeaders,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    if (!res.ok) return null;

    const fields = await res.json();

    // Buscar el campo por nombre, soportando variantes en ingles y espanol
    const epicField = fields.find(
      (f) =>
        f.name?.toLowerCase().includes("epic link") ||
        f.name?.toLowerCase().includes("enlace de épica") ||
        f.name?.toLowerCase().includes("enlace épica")
    );
    return epicField?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Busca tickets en Jira usando JQL (Jira Query Language) con paginacion por cursor.
 *
 * Utiliza el endpoint /rest/api/3/search/jql que soporta paginacion basada en
 * `nextPageToken` (mas eficiente que offset para conjuntos grandes de datos).
 * Solicita hasta 100 tickets por pagina y continua hasta agotar los resultados.
 *
 * @param {string} jql - Consulta JQL para filtrar tickets (ej: "project = PGIM ORDER BY updated DESC")
 * @param {string|null} epicLinkFieldId - ID del campo Epic Link descubierto dinamicamente,
 *   para incluirlo en los campos solicitados si difiere del valor por defecto
 * @returns {Promise<Array<Object>>} Arreglo con todos los issues encontrados en Jira
 * @throws {Error} Si la API de Jira responde con un codigo de error HTTP
 */
async function searchJira(jql, epicLinkFieldId) {
  const allIssues = [];

  // Campos base a solicitar en cada peticion
  const baseFields = "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10036,customfield_10020,customfield_10014,description,issuelinks,labels";

  // Agregar el campo Epic Link descubierto si es diferente al incluido por defecto
  const fields = epicLinkFieldId && epicLinkFieldId !== "customfield_10014"
    ? `${baseFields},${epicLinkFieldId}`
    : baseFields;

  let nextPageToken = null;

  // Bucle de paginacion por cursor: continuar hasta que no haya mas paginas
  while (true) {
    const params = new URLSearchParams({ jql, maxResults: "100", fields });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql?${params}`, {
      method: "GET",
      headers: jiraHeaders,
      signal: AbortSignal.timeout(20000), // 20s timeout per page
    });

    if (!res.ok) throw new Error(`Jira API (${res.status}): ${await res.text()}`);

    const data = await res.json();
    allIssues.push(...(data.issues || []));

    // Si no hay token de siguiente pagina o no hay issues, terminar
    if (!data.nextPageToken || !data.issues?.length) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

/**
 * Extrae el nombre del sprint activo de un campo de sprint de Jira.
 * Si no hay sprint activo, retorna el nombre del ultimo sprint en el arreglo
 * (generalmente el mas reciente).
 *
 * @param {Array<Object>|null} sprintField - Campo customfield_10020 de Jira que contiene
 *   un arreglo de objetos sprint con propiedades { name, state, ... }
 * @returns {string|null} Nombre del sprint activo o mas reciente, o null si no hay sprints
 */
function extractSprintName(sprintField) {
  if (!Array.isArray(sprintField) || sprintField.length === 0) return null;
  // Priorizar el sprint con estado "active"; si no hay, tomar el ultimo del arreglo
  const active = sprintField.find(s => s.state === "active") ?? sprintField[sprintField.length - 1];
  return active?.name ?? null;
}

/**
 * Transforma un issue crudo de la API de Jira en 4 objetos relacionales normalizados
 * listos para insertar en Supabase.
 *
 * La transformacion separa la informacion del ticket en entidades independientes
 * para mantener la base de datos normalizada y evitar datos duplicados.
 *
 * @param {Object} issue - Issue crudo de la API de Jira (con campos .key y .fields)
 * @param {string|null} epicLinkFieldId - ID del campo Epic Link descubierto dinamicamente
 * @returns {{
 *   ticket: Object,    - Fila para la tabla jira_tickets
 *   persons: Array,    - Filas para la tabla jira_persons (asignado y reportero)
 *   subtasks: Array,   - Filas para la tabla jira_ticket_subtasks
 *   links: Array       - Filas para la tabla jira_ticket_links
 * }}
 */
function transformIssue(issue, epicLinkFieldId) {
  const f = issue.fields || {};
  const now = new Date().toISOString();

  // Identificador unico de personas: preferir email, si no existe usar accountId
  const assigneeId = f.assignee?.emailAddress || f.assignee?.accountId || "";
  const reporterId = f.reporter?.emailAddress  || f.reporter?.accountId  || "";

  // Epic Link: obtener del campo descubierto dinamicamente en tiempo de ejecucion
  const epicLinkKey = epicLinkFieldId ? (f[epicLinkFieldId] ?? null) : null;

  // Construir el objeto del ticket normalizado
  const ticket = {
    jira_key:       issue.key,
    summary:        f.summary       || "",
    description:    f.description   || null,
    status:         f.status?.name  || "",
    assignee_email: assigneeId,
    priority:       f.priority?.name || "",
    issue_type:     f.issuetype?.name || "",
    sprint:         extractSprintName(f.customfield_10020),
    story_points:   f.customfield_10036 ?? null,
    reporter_email: reporterId,
    // Jerarquia del ticket: 3 posibles fuentes de relacion padre
    // f.parent?.key = relacion directa en proyectos next-gen / subtareas
    // f.customfield_10014 = Epic Link clasico en proyectos company-managed
    // epicLinkKey = campo descubierto dinamicamente (varia por instancia Jira)
    parent_key:     f.parent?.key || f.customfield_10014 || epicLinkKey || null,
    created_at:     f.created       || null,
    updated_at:     f.updated       || null,
    synced_at:      now,
    labels:         Array.isArray(f.labels) && f.labels.length > 0 ? f.labels : null,
  };

  // Construir arreglo de personas (se deduplicara mas adelante por email/accountId)
  const persons = [];
  if (assigneeId) {
    persons.push({ email: assigneeId, display_name: f.assignee.displayName || assigneeId });
  }
  if (reporterId) {
    persons.push({ email: reporterId, display_name: f.reporter.displayName || reporterId });
  }

  // Subtareas: mapear relaciones padre-hijo
  const subtasks = (f.subtasks || []).map(s => ({
    parent_key: issue.key,
    child_key:  s.key,
  }));

  // Enlaces entre tickets: extraer la clave destino y el tipo de relacion
  const links = (f.issuelinks || [])
    .map(l => {
      // Un enlace puede ser inward (entrante) u outward (saliente)
      const targetKey = l.inwardIssue?.key ?? l.outwardIssue?.key;
      const linkType  = l.inwardIssue ? (l.type?.inward ?? "inward") : (l.type?.outward ?? "outward");
      return targetKey ? { source_key: issue.key, target_key: targetKey, link_type: linkType } : null;
    })
    .filter(Boolean); // Eliminar entradas nulas

  return { ticket, persons, subtasks, links };
}

/**
 * Verifica que una peticion GET provenga de un Cron Job de Vercel.
 * Vercel envia el header `Authorization: Bearer <CRON_SECRET>` en cada ejecucion programada.
 *
 * Si CRON_SECRET no esta configurado (desarrollo local), permite todas las peticiones.
 *
 * @param {Request} request - Objeto Request de la peticion HTTP entrante
 * @returns {boolean} true si la autenticacion es valida o si no hay secreto configurado
 */
function verifyCronSecret(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Sin configurar: permitir (desarrollo local)
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── Logica Principal de Sincronizacion ─────────────────────────────────────

/**
 * Ejecuta el flujo completo de sincronizacion Jira -> Supabase.
 *
 * Pasos:
 *   1. Validar configuracion de Jira
 *   2. Construir consulta JQL segun los proyectos configurados
 *   3. Descubrir el campo Epic Link y obtener todos los tickets
 *   4. Transformar cada ticket en entidades normalizadas
 *   5. Consultar estados actuales en Supabase para detectar cambios
 *   6. Hacer upsert por lotes de: personas, tickets, subtareas y enlaces
 *   7. Registrar cambios de estado en el historial
 *
 * @returns {Promise<Response>} Respuesta JSON con el resultado de la sincronizacion:
 *   - En exito: { success, message, synced, statusChanges, persons, subtasks, links, timestamp }
 *   - En error: { error } con status 500
 */
async function runSync() {
  try {
    // Validar que la configuracion de Jira este completa
    if (!JIRA_BASE_URL || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
      return Response.json(
        { error: "Configuración de Jira incompleta en el servidor" },
        { status: 500 }
      );
    }

    // Paso 0: Validar credenciales y conectividad con Jira para evitar falsos éxitos
    try {
      const authCheck = await fetch(`${JIRA_BASE_URL}/rest/api/3/myself`, {
        method: "GET",
        headers: jiraHeaders,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (authCheck.status === 401) {
        return Response.json(
          { error: "Error de autenticación con Jira (401). Por favor, verifica el correo y el API token en el archivo .env.local" },
          { status: 401 }
        );
      }

      if (!authCheck.ok) {
        const authErrText = await authCheck.text();
        return Response.json(
          { error: `Error de conexión con Jira (${authCheck.status}): ${authErrText || authCheck.statusText}` },
          { status: authCheck.status >= 400 && authCheck.status < 600 ? authCheck.status : 500 }
        );
      }
    } catch (fetchErr) {
      return Response.json(
        { error: `Error de conexión o timeout al validar credenciales de Jira: ${fetchErr.message}` },
        { status: 504 }
      );
    }

    // Construir consulta JQL: si hay proyectos configurados, filtrar por ellos
    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      // Soporta multiples proyectos separados por coma (ej: "PGIM,OTRO")
      const projects = JIRA_PROJECT_KEY.split(",").map(p => `"${p.trim()}"`).join(", ");
      jql = `project in (${projects}) ORDER BY updated DESC`;
    }

    // Paso 1: Descubrir el campo Epic Link y obtener todos los issues de Jira
    const epicLinkFieldId = await getEpicLinkFieldId();
    const issues   = await searchJira(jql, epicLinkFieldId);

    // Transformar todos los issues en entidades normalizadas
    const transformed = issues.map(i => transformIssue(i, epicLinkFieldId));

    if (transformed.length === 0) {
      return Response.json({ success: true, message: "No se encontraron tickets", synced: 0, statusChanges: 0 });
    }

    const tickets  = transformed.map(t => t.ticket);
    const jiraKeys = tickets.map(t => t.jira_key);

    // Deduplicar personas por email (un mismo usuario puede aparecer como
    // asignado en un ticket y como reportero en otro)
    const personsMap = new Map();
    transformed.forEach(({ persons }) =>
      persons.forEach(p => personsMap.set(p.email, p))
    );
    const allPersons = [...personsMap.values()];

    // Aplanar arreglos de subtareas y enlaces de todos los tickets
    const allSubtasks = transformed.flatMap(t => t.subtasks);
    const allLinks    = transformed.flatMap(t => t.links);

    // Paso 2: Obtener estados actuales en Supabase para detectar cambios
    // Se consulta en lotes de 200 para evitar exceder limites de la API
    const statusMap = {};
    const batchSize = 200;
    for (let i = 0; i < jiraKeys.length; i += batchSize) {
      const { data } = await supabaseAdmin
        .from("jira_tickets")
        .select("jira_key, status")
        .in("jira_key", jiraKeys.slice(i, i + batchSize));
      for (const t of data || []) statusMap[t.jira_key] = t.status;
    }

    // Paso 3: Detectar cambios de estado comparando Jira vs Supabase
    const now = new Date().toISOString();
    const statusChanges = [];
    for (const t of tickets) {
      const oldStatus = statusMap[t.jira_key];
      if (oldStatus === undefined) {
        // Ticket nuevo: registrar como primer estado
        statusChanges.push({ jira_key: t.jira_key, old_status: null,      new_status: t.status, changed_at: now });
      } else if (oldStatus !== t.status) {
        // Ticket existente con estado diferente: registrar el cambio
        statusChanges.push({ jira_key: t.jira_key, old_status: oldStatus, new_status: t.status, changed_at: now });
      }
    }

    // Paso 4: Upsert de personas (antes que tickets para respetar claves foraneas)
    if (allPersons.length > 0) {
      for (let i = 0; i < allPersons.length; i += batchSize) {
        await supabaseAdmin
          .from("jira_persons")
          .upsert(allPersons.slice(i, i + batchSize), { onConflict: "email" });
      }
    }

    // Paso 5: Upsert de tickets en lotes de 500 (limite practico para Supabase)
    const upsertBatch = 500;
    for (let i = 0; i < tickets.length; i += upsertBatch) {
      const { error } = await supabaseAdmin
        .from("jira_tickets")
        .upsert(tickets.slice(i, i + upsertBatch), { onConflict: "jira_key" });
      if (error) throw new Error(`Supabase upsert tickets (lote ${i}): ${error.message}`);
    }

    // Paso 6: Upsert de subtareas (relaciones padre-hijo)
    if (allSubtasks.length > 0) {
      for (let i = 0; i < allSubtasks.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_subtasks")
          .upsert(allSubtasks.slice(i, i + upsertBatch), { onConflict: "parent_key,child_key" });
        if (error) console.warn("Error upsert subtasks:", error.message);
      }
    }

    // Paso 7: Upsert de enlaces entre tickets
    if (allLinks.length > 0) {
      for (let i = 0; i < allLinks.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_links")
          .upsert(allLinks.slice(i, i + upsertBatch), { onConflict: "source_key,target_key" });
        if (error) console.warn("Error upsert links:", error.message);
      }
    }

    // Paso 8: Registrar cambios de estado en la tabla de historial
    if (statusChanges.length > 0) {
      for (let i = 0; i < statusChanges.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_status_history")
          .insert(statusChanges.slice(i, i + upsertBatch));
        if (error) console.warn("Error registrando historial:", error.message);
      }
    }

    // Paso 9: Eliminación lógica — marcar tickets eliminados en Jira con deleted_at
    // Los tickets se mantienen en Supabase para registro, pero con un timestamp que
    // indica cuándo fueron detectados como eliminados en Jira.
    const jiraKeySet = new Set(jiraKeys);
    let deletedCount = 0;
    let revivedCount = 0;

    if (JIRA_PROJECT_KEY) {
      const projectPrefixes = JIRA_PROJECT_KEY.split(",").map(p => `${p.trim()}-`);
      let existingKeys = [];

      for (const prefix of projectPrefixes) {
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: existingBatch } = await supabaseAdmin
            .from("jira_tickets")
            .select("jira_key, deleted_at")
            .like("jira_key", `${prefix}%`)
            .range(from, from + batchSize - 1);

          if (!existingBatch || existingBatch.length === 0) {
            hasMore = false;
            break;
          }
          existingKeys.push(...existingBatch);
          from += batchSize;
          hasMore = existingBatch.length === batchSize;
        }
      }

      // Tickets que existen en Supabase (sin deleted_at) pero ya no en Jira → marcar como eliminados
      const toSoftDelete = existingKeys
        .filter(t => !t.deleted_at && !jiraKeySet.has(t.jira_key))
        .map(t => t.jira_key);
      deletedCount = toSoftDelete.length;

      if (toSoftDelete.length > 0) {
        console.log(`Marcando ${toSoftDelete.length} ticket(s) como eliminados:`, toSoftDelete);
        for (let i = 0; i < toSoftDelete.length; i += batchSize) {
          const batch = toSoftDelete.slice(i, i + batchSize);
          const { error } = await supabaseAdmin
            .from("jira_tickets")
            .update({ deleted_at: now })
            .in("jira_key", batch);
          if (error) console.warn("Error en soft-delete:", error.message);
        }
      }

      // Tickets que tenían deleted_at pero reaparecieron en Jira → revivir (limpiar deleted_at)
      const toRevive = existingKeys
        .filter(t => t.deleted_at && jiraKeySet.has(t.jira_key))
        .map(t => t.jira_key);
      revivedCount = toRevive.length;

      if (toRevive.length > 0) {
        console.log(`Reviviendo ${toRevive.length} ticket(s) que reaparecieron en Jira:`, toRevive);
        for (let i = 0; i < toRevive.length; i += batchSize) {
          const batch = toRevive.slice(i, i + batchSize);
          const { error } = await supabaseAdmin
            .from("jira_tickets")
            .update({ deleted_at: null })
            .in("jira_key", batch);
          if (error) console.warn("Error reviviendo tickets:", error.message);
        }
      }
    }

    // Retornar resumen de la sincronizacion exitosa
    return Response.json({
      success:          true,
      message:          "Sincronización completada",
      synced:           tickets.length,
      deleted:          deletedCount,
      statusChanges:    statusChanges.length,
      persons:          allPersons.length,
      subtasks:         allSubtasks.length,
      links:            allLinks.length,
      epicLinkFieldId:  epicLinkFieldId,
      timestamp:        now,
    });

  } catch (error) {
    console.error("Error en sync-jira:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Handlers HTTP (Endpoints de la API) ────────────────────────────────────

/**
 * Handler GET: Invocado automaticamente por Vercel Cron Jobs.
 * Valida el secreto CRON_SECRET en el header Authorization antes de ejecutar
 * la sincronizacion. Retorna 401 si la autenticacion falla.
 *
 * @param {Request} request - Objeto Request de la peticion HTTP
 * @returns {Promise<Response>} Resultado de la sincronizacion o error 401
 */
export async function GET(request) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}

/**
 * Handler POST: Invocado manualmente desde el boton de sincronizacion en la UI.
 * No requiere autenticacion adicional (la UI ya esta protegida).
 *
 * @returns {Promise<Response>} Resultado de la sincronizacion
 */
export async function POST() {
  return runSync();
}
