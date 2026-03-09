/**
 * ═══════════════════════════════════════════════════════════
 * API Route: POST /api/sync-jira
 * Ejecuta la sincronización de Jira → Supabase desde el server
 * ═══════════════════════════════════════════════════════════
 */

import { createClient } from "@supabase/supabase-js";

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente Supabase con service_role (solo server-side)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
const jiraHeaders = {
  Authorization: `Basic ${jiraAuth}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * Busca tickets en Jira via API con paginación
 */
async function searchJira(jql) {
  const allIssues = [];
  let startAt = 0;
  const maxResults = 50;
  let total = Infinity;

  while (startAt < total) {
    const fields = "key,summary,status,assignee,priority,issuetype,created,updated";
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(maxResults),
      fields,
    });
    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: jiraHeaders,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Jira API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    total = data.total;
    allIssues.push(...(data.issues || []));
    startAt += maxResults;
  }

  return allIssues;
}

/**
 * Transforma issue de Jira al formato de nuestra tabla
 */
function transformIssue(issue) {
  const fields = issue.fields || {};
  return {
    jira_key: issue.key,
    summary: fields.summary || "",
    status: fields.status?.name || "",
    assignee_email: fields.assignee?.emailAddress || "",
    assignee_name: fields.assignee?.displayName || "",
    priority: fields.priority?.name || "",
    issue_type: fields.issuetype?.name || "",
    created_at: fields.created || null,
    updated_at: fields.updated || null,
    synced_at: new Date().toISOString(),
  };
}

export async function POST() {
  try {
    // Validar configuración
    if (!JIRA_BASE_URL || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
      return Response.json(
        { error: "Configuración de Jira incompleta en el servidor" },
        { status: 500 }
      );
    }

    // Construir JQL — traer todos los tickets del proyecto (no solo última hora)
    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      jql = `project = ${JIRA_PROJECT_KEY} ORDER BY updated DESC`;
    }

    // 1. Buscar en Jira
    const issues = await searchJira(jql);
    const records = issues.map(transformIssue);

    if (records.length === 0) {
      return Response.json({
        success: true,
        message: "No se encontraron tickets en Jira",
        synced: 0,
        statusChanges: 0,
      });
    }

    // 2. Obtener estados actuales de Supabase
    const jiraKeys = records.map((r) => r.jira_key);
    const { data: currentTickets } = await supabaseAdmin
      .from("jira_tickets")
      .select("jira_key, status")
      .in("jira_key", jiraKeys);

    const statusMap = {};
    for (const t of currentTickets || []) {
      statusMap[t.jira_key] = t.status;
    }

    // 3. Detectar cambios de estado
    const statusChanges = [];
    const now = new Date().toISOString();

    for (const record of records) {
      const oldStatus = statusMap[record.jira_key];
      const newStatus = record.status;

      if (oldStatus === undefined) {
        statusChanges.push({
          jira_key: record.jira_key,
          old_status: null,
          new_status: newStatus,
          changed_at: now,
        });
      } else if (oldStatus !== newStatus) {
        statusChanges.push({
          jira_key: record.jira_key,
          old_status: oldStatus,
          new_status: newStatus,
          changed_at: now,
        });
      }
    }

    // 4. Upsert tickets
    const { error: upsertError } = await supabaseAdmin
      .from("jira_tickets")
      .upsert(records, { onConflict: "jira_key" });

    if (upsertError) {
      throw new Error(`Supabase upsert: ${upsertError.message}`);
    }

    // 5. Registrar cambios de estado
    if (statusChanges.length > 0) {
      const { error: historyError } = await supabaseAdmin
        .from("jira_ticket_status_history")
        .insert(statusChanges);

      if (historyError) {
        console.warn("Error registrando historial:", historyError.message);
      }
    }

    return Response.json({
      success: true,
      message: "Sincronización completada",
      synced: records.length,
      statusChanges: statusChanges.length,
      timestamp: now,
    });
  } catch (error) {
    console.error("Error en sync-jira API:", error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
