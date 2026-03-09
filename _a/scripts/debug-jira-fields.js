/**
 * Script de diagnóstico: muestra los campos de UN ticket de Jira
 * para identificar los IDs correctos de Story Points y Sprint
 * 
 * Uso: node scripts/debug-jira-fields.js
 */

const path = require("path");
const fs = require("fs");

// Cargar .env.local
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

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "";

const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

async function fetchOneIssue(jql) {
  // Usar /search/jql (la v3 deprecó /search en algunas instancias)
  const params = new URLSearchParams({
    jql,
    maxResults: "1",
    // Pedir todos los campos relevantes + custom fields comunes para sprint/story points
    fields: "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10016,customfield_10020,customfield_10028,customfield_10015,customfield_10026,customfield_10014,customfield_10002,customfield_10003,customfield_10004,customfield_10005,customfield_10006,customfield_10007,customfield_10008,customfield_10009,customfield_10010,customfield_10011,customfield_10012,customfield_10013,customfield_10017,customfield_10018,customfield_10019,customfield_10021,customfield_10022,customfield_10023,customfield_10024,customfield_10025,customfield_10027,customfield_10029,customfield_10030,customfield_10031,customfield_10032,customfield_10033,customfield_10034,customfield_10035,customfield_10036,customfield_10037,customfield_10038,customfield_10039,customfield_10040",
  });

  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params.toString()}`;
  console.log(`   URL: ${url.substring(0, 120)}...\n`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${jiraAuth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("❌ Error:", err);
    return null;
  }

  const data = await response.json();
  return data.issues?.[0] || null;
}

async function main() {
  console.log("🔍 Obteniendo UN ticket de Jira para inspeccionar campos...\n");

  // Buscar una Historia (Story) que probablemente tenga sprint y story points
  let jql = JIRA_PROJECT_KEY
    ? `project = ${JIRA_PROJECT_KEY} AND issuetype = Story ORDER BY updated DESC`
    : "issuetype = Story ORDER BY updated DESC";

  let issue = await fetchOneIssue(jql);

  if (!issue) {
    console.log("No se encontró ninguna Historia. Intentando con cualquier tipo...\n");
    jql = JIRA_PROJECT_KEY
      ? `project = ${JIRA_PROJECT_KEY} ORDER BY updated DESC`
      : "ORDER BY updated DESC";
    issue = await fetchOneIssue(jql);
  }

  if (!issue) {
    console.log("❌ No se encontraron tickets.");
    return;
  }

  printIssue(issue);
}

function printIssue(issue) {
  const fields = issue.fields;
  
  console.log("═══════════════════════════════════════════");
  console.log(`📌 Ticket: ${issue.key}`);
  console.log(`   Tipo:    ${fields.issuetype?.name}`);
  console.log(`   Resumen: ${fields.summary}`);
  console.log(`   Estado:  ${fields.status?.name}`);
  console.log("═══════════════════════════════════════════\n");

  // Campos estándar
  console.log("── Campos estándar ──");
  console.log(`   reporter:  ${JSON.stringify(fields.reporter?.displayName || null)}`);
  console.log(`   parent:    ${JSON.stringify(fields.parent?.key || null)}`);
  console.log(`   subtasks:  ${JSON.stringify(fields.subtasks?.map(s => s.key) || [])}`);
  console.log("");

  // Buscar campos personalizados relevantes
  console.log("── Campos personalizados (customfield_*) ──");
  console.log("   Buscando Sprint y Story Points...\n");

  const customFields = Object.entries(fields)
    .filter(([key]) => key.startsWith("customfield_"))
    .filter(([, value]) => value !== null && value !== undefined);

  if (customFields.length === 0) {
    console.log("   ⚠️  No se encontraron campos personalizados con valor.\n");
    console.log("   Esto puede deberse a que los campos no se solicitaron.");
    console.log("   Intentando con todos los campos...\n");
    
    // Listar todos los custom fields (incluso nulls)
    const allCustom = Object.entries(fields)
      .filter(([key]) => key.startsWith("customfield_"));
    
    console.log(`   Total custom fields: ${allCustom.length}`);
    allCustom.forEach(([key, value]) => {
      if (value !== null) {
        console.log(`   ✅ ${key}: ${JSON.stringify(value).substring(0, 120)}`);
      }
    });
  } else {
    customFields.forEach(([key, value]) => {
      const strValue = JSON.stringify(value);
      const preview = strValue.length > 150 ? strValue.substring(0, 150) + "..." : strValue;
      
      // Detectar sprint
      if (typeof value === 'object' && Array.isArray(value) && value[0]?.name && value[0]?.state) {
        console.log(`   🏃 ${key} ← SPRINT DETECTADO: "${value.map(s => s.name).join(", ")}"`);
      }
      // Detectar story points (número)  
      else if (typeof value === 'number') {
        console.log(`   📊 ${key} ← POSIBLE STORY POINTS: ${value}`);
      }
      else {
        console.log(`   📋 ${key}: ${preview}`);
      }
    });
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("✅ Usa los IDs de arriba para ajustar sync-jira.js si es necesario.");
  console.log("   Los campos con 🏃 = Sprint, con 📊 = Story Points");
  console.log("═══════════════════════════════════════════\n");
}

main().catch(console.error);
