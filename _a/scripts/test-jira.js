/**
 * Script de diagnóstico para verificar la API de Jira
 * Uso: node scripts/test-jira.js
 */
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
      if (key && value) process.env[key.trim()] = value.trim();
    }
  });
}

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "";

const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

async function main() {
  console.log("═══ DIAGNÓSTICO JIRA API ═══\n");
  console.log(`JIRA_BASE_URL: ${JIRA_BASE_URL}`);
  console.log(`JIRA_PROJECT_KEY: "${JIRA_PROJECT_KEY}"`);
  console.log("");

  // Test 1: Buscar con project key configurado
  console.log(`--- Test 1: project = ${JIRA_PROJECT_KEY} ---`);
  await testJQL(`project = ${JIRA_PROJECT_KEY} ORDER BY updated DESC`);

  // Test 2: Buscar sin filtro de proyecto (todos los issues)
  console.log(`\n--- Test 2: Sin filtro de proyecto ---`);
  await testJQL(`ORDER BY updated DESC`);

  // Test 3: Listar proyectos disponibles
  console.log(`\n--- Test 3: Proyectos disponibles ---`);
  await listProjects();
}

async function testJQL(jql) {
  const fields = "key,summary,status,issuetype";
  const params = new URLSearchParams({ jql, maxResults: "5", fields });
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params.toString()}`;

  console.log(`JQL: ${jql}`);
  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${jiraAuth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`❌ Error (${response.status}): ${errText}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ Respuesta exitosa`);
    console.log(`   total field: ${data.total}`);
    console.log(`   issues count: ${(data.issues || []).length}`);
    console.log(`   nextPageToken: ${data.nextPageToken ? "SÍ (hay más páginas)" : "NO"}`);

    if (data.issues && data.issues.length > 0) {
      console.log(`\n   Primeros issues:`);
      data.issues.forEach((issue) => {
        console.log(`     ${issue.key} [${issue.fields?.issuetype?.name}] - ${issue.fields?.status?.name} - ${(issue.fields?.summary || "").substring(0, 50)}`);
      });
    }

    // Test paginación: hacer 3 páginas de 100
    console.log(`\n   --- Probando paginación (3 páginas de 100) ---`);
    let token = null;
    let totalCount = 0;
    for (let page = 1; page <= 3; page++) {
      const pageParams = new URLSearchParams({ jql, maxResults: "100", fields });
      if (token) pageParams.set("nextPageToken", token);

      const pageUrl = `${JIRA_BASE_URL}/rest/api/3/search/jql?${pageParams.toString()}`;
      const pageResp = await fetch(pageUrl, {
        method: "GET",
        headers: {
          Authorization: `Basic ${jiraAuth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!pageResp.ok) {
        console.log(`   ❌ Página ${page} error: ${pageResp.status}`);
        break;
      }

      const pageData = await pageResp.json();
      const count = (pageData.issues || []).length;
      totalCount += count;
      console.log(`   Página ${page}: ${count} issues (acumulado: ${totalCount}), nextPageToken: ${pageData.nextPageToken ? "SÍ" : "NO"}`);

      if (!pageData.nextPageToken || count === 0) {
        console.log(`   (No hay más páginas)`);
        break;
      }
      token = pageData.nextPageToken;
    }

  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }
}

async function listProjects() {
  try {
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/project`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${jiraAuth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`❌ Error (${response.status}): ${errText}`);
      return;
    }

    const projects = await response.json();
    console.log(`✅ ${projects.length} proyecto(s) encontrado(s):`);
    projects.forEach((p) => {
      console.log(`   Key: ${p.key} | Nombre: ${p.name} | ID: ${p.id}`);
    });
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }
}

main();
