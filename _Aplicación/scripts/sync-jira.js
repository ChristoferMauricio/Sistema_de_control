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
  let startAt = 0;
  const maxResults = 50;
  let total = Infinity;

  console.log(`🔍 JQL: ${jql}`);

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
      throw new Error(`Error de Jira API (${response.status}): ${errText}`);
    }

    const data = await response.json();
    total = data.total;
    allIssues.push(...(data.issues || []));
    startAt += maxResults;

    console.log(`   📄 Obtenidos ${allIssues.length}/${total} issues`);
  }

  return allIssues;
}

/**
 * Transforma un issue de Jira al formato de nuestra tabla
 * @param {object} issue - Issue de Jira
 * @returns {object} - Registro para Supabase
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

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log("════════════════════════════════════════");
  console.log("🚀 JIRA SYNC — Inicio de sincronización");
  console.log(`   📅 ${new Date().toISOString()}`);
  console.log("════════════════════════════════════════\n");

  try {
    // Construir JQL: tickets actualizados en la última hora
    // Si hay un project key, filtrar por proyecto
    let jql = "updated >= -1h ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      jql = `project = ${JIRA_PROJECT_KEY} AND updated >= -1h ORDER BY updated DESC`;
    }

    // 1. Buscar en Jira
    const issues = await searchJira(jql);
    console.log(`\n✅ Total issues encontrados: ${issues.length}\n`);

    if (issues.length === 0) {
      console.log("ℹ️  No hay tickets actualizados en la última hora.");
      console.log("════════════════════════════════════════");
      return;
    }

    // 2. Transformar datos
    const records = issues.map(transformIssue);
    console.log("🔄 Datos transformados, iniciando upsert...\n");

    // 3. Upsert en Supabase
    await upsertToSupabase(records);

    console.log(`\n🎉 Sincronización completada exitosamente!`);
    console.log(`   ${records.length} tickets sincronizados.`);
  } catch (error) {
    console.error("\n❌ Error durante la sincronización:");
    console.error(`   ${error.message}`);
    process.exit(1);
  }

  console.log("════════════════════════════════════════\n");
}

main();
