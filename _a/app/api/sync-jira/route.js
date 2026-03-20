/**
 * ═══════════════════════════════════════════════════════════
 * API Route: /api/sync-jira
 * GET  → Vercel Cron Job (verifica CRON_SECRET)
 * POST → Botón manual desde la UI
 * ═══════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";

const JIRA_BASE_URL      = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL    = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN     = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY   = process.env.JIRA_PROJECT_KEY || "";
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

// Vercel: máximo tiempo de ejecución (60s en plan Hobby)
export const maxDuration = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Busca tickets en Jira via API con paginación por cursor
 */
async function searchJira(jql) {
  const allIssues = [];
  const fields = "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10036,customfield_10020,description,issuelinks";
  let nextPageToken = null;

  while (true) {
    const params = new URLSearchParams({ jql, maxResults: "100", fields });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/2/search/jql?${params}`, {
      method: "GET",
      headers: jiraHeaders,
    });

    if (!res.ok) throw new Error(`Jira API (${res.status}): ${await res.text()}`);

    const data = await res.json();
    allIssues.push(...(data.issues || []));

    if (!data.nextPageToken || !data.issues?.length) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

/**
 * Extrae el nombre del sprint activo (o el más reciente)
 */
function extractSprintName(sprintField) {
  if (!Array.isArray(sprintField) || sprintField.length === 0) return null;
  const active = sprintField.find(s => s.state === "active") ?? sprintField[sprintField.length - 1];
  return active?.name ?? null;
}

/**
 * Transforma un issue de Jira en los 4 objetos relacionales normalizados:
 *   ticket   → fila para jira_tickets (sin arrays, sin nombres derivados)
 *   persons  → filas para jira_persons (assignee + reporter)
 *   subtasks → filas para jira_ticket_subtasks
 *   links    → filas para jira_ticket_links
 */
function transformIssue(issue) {
  const f = issue.fields || {};
  const now = new Date().toISOString();

  // Usar emailAddress si existe, sino accountId como identificador único
  const assigneeId = f.assignee?.emailAddress || f.assignee?.accountId || "";
  const reporterId = f.reporter?.emailAddress  || f.reporter?.accountId  || "";

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
    parent_key:     f.parent?.key   || null,
    created_at:     f.created       || null,
    updated_at:     f.updated       || null,
    synced_at:      now,
  };

  // Persons: deduplicar más adelante por email/accountId
  const persons = [];
  if (assigneeId) {
    persons.push({ email: assigneeId, display_name: f.assignee.displayName || assigneeId });
  }
  if (reporterId) {
    persons.push({ email: reporterId, display_name: f.reporter.displayName || reporterId });
  }

  // Subtareas
  const subtasks = (f.subtasks || []).map(s => ({
    parent_key: issue.key,
    child_key:  s.key,
  }));

  // Links entre tickets
  const links = (f.issuelinks || [])
    .map(l => {
      const targetKey = l.inwardIssue?.key ?? l.outwardIssue?.key;
      const linkType  = l.inwardIssue ? (l.type?.inward ?? "inward") : (l.type?.outward ?? "outward");
      return targetKey ? { source_key: issue.key, target_key: targetKey, link_type: linkType } : null;
    })
    .filter(Boolean);

  return { ticket, persons, subtasks, links };
}

/**
 * Verifica que la petición venga de un Cron Job de Vercel.
 * Vercel envía: Authorization: Bearer <CRON_SECRET>
 */
function verifyCronSecret(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Sin configurar → permitir (desarrollo local)
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── Lógica principal de sincronización ─────────────────────────────────────

async function runSync() {
  try {
    if (!JIRA_BASE_URL || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
      return Response.json(
        { error: "Configuración de Jira incompleta en el servidor" },
        { status: 500 }
      );
    }

    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      const projects = JIRA_PROJECT_KEY.split(",").map(p => `"${p.trim()}"`).join(", ");
      jql = `project in (${projects}) ORDER BY updated DESC`;
    }

    // 1. Obtener issues de Jira y transformarlos
    const issues   = await searchJira(jql);
    const transformed = issues.map(transformIssue);

    if (transformed.length === 0) {
      return Response.json({ success: true, message: "No se encontraron tickets", synced: 0, statusChanges: 0 });
    }

    const tickets  = transformed.map(t => t.ticket);
    const jiraKeys = tickets.map(t => t.jira_key);

    // Deduplicar persons por email (un mismo email puede aparecer en múltiples tickets)
    const personsMap = new Map();
    transformed.forEach(({ persons }) =>
      persons.forEach(p => personsMap.set(p.email, p))
    );
    const allPersons = [...personsMap.values()];

    // Aplanar subtasks y links
    const allSubtasks = transformed.flatMap(t => t.subtasks);
    const allLinks    = transformed.flatMap(t => t.links);

    // 2. Obtener estados actuales en Supabase (para detectar cambios)
    const statusMap = {};
    const batchSize = 200;
    for (let i = 0; i < jiraKeys.length; i += batchSize) {
      const { data } = await supabaseAdmin
        .from("jira_tickets")
        .select("jira_key, status")
        .in("jira_key", jiraKeys.slice(i, i + batchSize));
      for (const t of data || []) statusMap[t.jira_key] = t.status;
    }

    // 3. Detectar cambios de estado
    const now = new Date().toISOString();
    const statusChanges = [];
    for (const t of tickets) {
      const oldStatus = statusMap[t.jira_key];
      if (oldStatus === undefined) {
        statusChanges.push({ jira_key: t.jira_key, old_status: null,      new_status: t.status, changed_at: now });
      } else if (oldStatus !== t.status) {
        statusChanges.push({ jira_key: t.jira_key, old_status: oldStatus, new_status: t.status, changed_at: now });
      }
    }

    // 4. Upsert jira_persons (antes de tickets para respetar FK si se activa)
    if (allPersons.length > 0) {
      for (let i = 0; i < allPersons.length; i += batchSize) {
        await supabaseAdmin
          .from("jira_persons")
          .upsert(allPersons.slice(i, i + batchSize), { onConflict: "email" });
      }
    }

    // 5. Upsert jira_tickets en lotes de 500
    const upsertBatch = 500;
    for (let i = 0; i < tickets.length; i += upsertBatch) {
      const { error } = await supabaseAdmin
        .from("jira_tickets")
        .upsert(tickets.slice(i, i + upsertBatch), { onConflict: "jira_key" });
      if (error) throw new Error(`Supabase upsert tickets (lote ${i}): ${error.message}`);
    }

    // 6. Upsert jira_ticket_subtasks
    if (allSubtasks.length > 0) {
      for (let i = 0; i < allSubtasks.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_subtasks")
          .upsert(allSubtasks.slice(i, i + upsertBatch), { onConflict: "parent_key,child_key" });
        if (error) console.warn("Error upsert subtasks:", error.message);
      }
    }

    // 7. Upsert jira_ticket_links
    if (allLinks.length > 0) {
      for (let i = 0; i < allLinks.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_links")
          .upsert(allLinks.slice(i, i + upsertBatch), { onConflict: "source_key,target_key" });
        if (error) console.warn("Error upsert links:", error.message);
      }
    }

    // 8. Registrar cambios de estado
    if (statusChanges.length > 0) {
      for (let i = 0; i < statusChanges.length; i += upsertBatch) {
        const { error } = await supabaseAdmin
          .from("jira_ticket_status_history")
          .insert(statusChanges.slice(i, i + upsertBatch));
        if (error) console.warn("Error registrando historial:", error.message);
      }
    }

    return Response.json({
      success:       true,
      message:       "Sincronización completada",
      synced:        tickets.length,
      statusChanges: statusChanges.length,
      persons:       allPersons.length,
      subtasks:      allSubtasks.length,
      links:         allLinks.length,
      timestamp:     now,
    });

  } catch (error) {
    console.error("Error en sync-jira:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Handlers HTTP ───────────────────────────────────────────────────────────

/** GET: Vercel Cron Jobs */
export async function GET(request) {
  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSync();
}

/** POST: botón manual desde la UI */
export async function POST() {
  return runSync();
}
