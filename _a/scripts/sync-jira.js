/**
 * ═══════════════════════════════════════════════════════════
 * JIRA SYNC SCRIPT
 * Sincroniza tickets de Jira hacia Supabase via API REST
 *
 * Uso: node scripts/sync-jira.js
 * Requiere: JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN,
 *           NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ═══════════════════════════════════════════════════════════
 */

// Cargar variables de entorno desde .env.local si existe
const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

// ─── Configuración ─────────────────────────────────────────

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar variables requeridas
const required = {
  JIRA_BASE_URL,
  JIRA_USER_EMAIL,
  JIRA_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_KEY,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error("❌ Variables de entorno faltantes:", missing.join(", "));
  console.error("   Revisa tu archivo .env.local o las variables de entorno del sistema.");
  process.exit(1);
}

// ─── Jira API helpers ──────────────────────────────────────

const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

const jiraHeaders = {
  Authorization: `Basic ${jiraAuth}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * Busca tickets en Jira usando JQL con paginación automática
 * @param {string} jql - Consulta JQL
 * @returns {Promise<Array>} - Array de issues
 */
async function searchJira(jql) {
  const allIssues = [];
  const maxResults = 100;
  let nextPageToken = null;
  let pageNum = 0;

  console.log(`🔍 JQL: ${jql}`);

  while (true) {
    // Campos: key, summary, status, assignee, priority, issuetype, created, updated
    //         + sprint (customfield_10020), story_points (customfield_10016),
    //         + reporter, parent, subtasks
    const fields = "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10036,customfield_10020,issuelinks";
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields,
    });

    // Agregar token de paginación si existe (segunda página en adelante)
    if (nextPageToken) {
      params.set("nextPageToken", nextPageToken);
    }

    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: jiraHeaders,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error de Jira API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const issues = data.issues || [];
    allIssues.push(...issues);
    pageNum++;

    console.log(`   📄 Página ${pageNum}: +${issues.length} issues (total acumulado: ${allIssues.length})`);

    // Si no hay nextPageToken, ya no hay más páginas
    if (!data.nextPageToken || issues.length === 0) {
      break;
    }

    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

/**
 * Extrae el nombre del sprint activo de los datos de Jira
 * customfield_10020 es un array de sprints, tomamos el último (activo)
 */
function extractSprintName(sprintField) {
  if (!sprintField || !Array.isArray(sprintField) || sprintField.length === 0) {
    return null;
  }
  // El último sprint en el array suele ser el activo
  const activeSprint = sprintField.find(s => s.state === "active") || sprintField[sprintField.length - 1];
  return activeSprint?.name || null;
}

/**
 * Transforma un issue de Jira al formato de nuestra tabla
 * @param {object} issue - Issue de Jira
 * @returns {object} - Registro para Supabase
 */
function transformIssue(issue) {
  const fields = issue.fields || {};

  // Extract linked issue keys from issuelinks
  const linkedKeys = (fields.issuelinks || []).reduce((acc, link) => {
    if (link.inwardIssue?.key) acc.push(link.inwardIssue.key);
    if (link.outwardIssue?.key) acc.push(link.outwardIssue.key);
    return acc;
  }, []);

  return {
    jira_key: issue.key,
    summary: fields.summary || "",
    status: fields.status?.name || "",
    assignee_email: fields.assignee?.emailAddress || "",
    priority: fields.priority?.name || "",
    issue_type: fields.issuetype?.name || "",
    sprint: extractSprintName(fields.customfield_10020),
    story_points: fields.customfield_10036 || null,
    reporter_email: fields.reporter?.emailAddress || "",
    parent_key: fields.parent?.key || null,
    subtask_keys: fields.subtasks && fields.subtasks.length > 0
      ? fields.subtasks.map(s => s.key)
      : null,
    linked_keys: linkedKeys.length > 0 ? linkedKeys : null,
    created_at: fields.created || null,
    updated_at: fields.updated || null,
    synced_at: new Date().toISOString(),
  };
}

// ─── Supabase helpers ──────────────────────────────────────

/**
 * Hace upsert masivo de tickets en Supabase
 * @param {Array} records - Array de registros a insertar/actualizar
 */
async function upsertToSupabase(records) {
  if (records.length === 0) {
    console.log("ℹ️  No hay registros para insertar.");
    return;
  }

  // Upsert en lotes de 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/jira_tickets?on_conflict=jira_key`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error de Supabase (${response.status}): ${errText}`);
    }

    inserted += batch.length;
    console.log(`   💾 Upserted ${inserted}/${records.length} registros`);
  }
}

/**
 * Obtiene los estados actuales de los tickets desde Supabase
 * @param {Array<string>} jiraKeys - Array de jira_key a consultar
 * @returns {Promise<Object>} - Mapa { jira_key: status }
 */
async function fetchCurrentStatuses(jiraKeys) {
  const statusMap = {};
  const batchSize = 50;

  for (let i = 0; i < jiraKeys.length; i += batchSize) {
    const batch = jiraKeys.slice(i, i + batchSize);
    const filter = batch.map((k) => `"${k}"`).join(",");

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/jira_tickets?jira_key=in.(${filter})&select=jira_key,status`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️  Error obteniendo estados actuales: ${errText}`);
      continue;
    }

    const data = await response.json();
    for (const row of data) {
      statusMap[row.jira_key] = row.status;
    }
  }

  return statusMap;
}

/**
 * Registra cambios de estado en la tabla de historial
 * @param {Array} changes - Array de { jira_key, old_status, new_status }
 */
async function recordStatusChanges(changes) {
  if (changes.length === 0) {
    console.log("ℹ️  No hay cambios de estado para registrar.");
    return;
  }

  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/jira_ticket_status_history`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`⚠️  Error registrando historial: ${errText}`);
      continue;
    }

    inserted += batch.length;
  }

  console.log(`   📊 ${inserted} cambio(s) de estado registrados en historial`);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log("════════════════════════════════════════");
  console.log("🚀 JIRA SYNC — Inicio de sincronización");
  console.log(`   📅 ${new Date().toISOString()}`);
  console.log("════════════════════════════════════════\n");

  try {
    // Modo: --recent solo trae la última hora, por defecto trae TODO
    const isRecent = process.argv.includes("--recent");

    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      if (JIRA_PROJECT_KEY.includes(",")) {
        jql = `project IN (${JIRA_PROJECT_KEY}) ORDER BY updated DESC`;
      } else {
        jql = `project = ${JIRA_PROJECT_KEY} ORDER BY updated DESC`;
      }
    }

    if (isRecent) {
      if (JIRA_PROJECT_KEY) {
        if (JIRA_PROJECT_KEY.includes(",")) {
          jql = `project IN (${JIRA_PROJECT_KEY}) AND updated >= -1h ORDER BY updated DESC`;
        } else {
          jql = `project = ${JIRA_PROJECT_KEY} AND updated >= -1h ORDER BY updated DESC`;
        }
      } else {
        jql = "updated >= -1h ORDER BY updated DESC";
      }
      console.log("📌 Modo incremental: solo tickets de la última hora\n");
    } else {
      console.log("📌 Modo completo: sincronizando TODOS los tickets\n");
    }

    // 1. Buscar en Jira
    const issues = await searchJira(jql);
    console.log(`\n✅ Total issues encontrados: ${issues.length}\n`);

    if (issues.length === 0) {
      console.log("ℹ️  No se encontraron tickets.");
      console.log("════════════════════════════════════════");
      return;
    }

    // 2. Transformar datos
    const records = issues.map(transformIssue);
    console.log("🔄 Datos transformados\n");

    // 3. Detectar cambios de estado
    const jiraKeys = records.map((r) => r.jira_key);
    const currentStatuses = await fetchCurrentStatuses(jiraKeys);

    const statusChanges = [];
    const now = new Date().toISOString();

    for (const record of records) {
      const oldStatus = currentStatuses[record.jira_key];
      const newStatus = record.status;

      if (oldStatus === undefined) {
        // Ticket nuevo — registrar estado inicial
        statusChanges.push({
          jira_key: record.jira_key,
          old_status: null,
          new_status: newStatus,
          changed_at: now,
        });
      } else if (oldStatus !== newStatus) {
        // Estado cambió — registrar transición
        statusChanges.push({
          jira_key: record.jira_key,
          old_status: oldStatus,
          new_status: newStatus,
          changed_at: now,
        });
      }
    }

    console.log(`   🔀 ${statusChanges.length} cambio(s) de estado detectados`);

    // 4. Upsert tickets en Supabase
    await upsertToSupabase(records);

    // 5. Registrar cambios de estado en historial
    if (statusChanges.length > 0) {
      await recordStatusChanges(statusChanges);
    }

    console.log(`\n🎉 Sincronización completada exitosamente!`);
    console.log(`   ${records.length} tickets sincronizados.`);
    console.log(`   ${statusChanges.length} cambios de estado registrados.`);
  } catch (error) {
    console.error("\n❌ Error durante la sincronización:");
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  console.log("════════════════════════════════════════\n");
}

main();
