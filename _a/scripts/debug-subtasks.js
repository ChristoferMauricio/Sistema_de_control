/**
 * Debug script: Check PF3-3079 subtask relationships in DB and Jira
 */
const path = require("path");
const fs = require("fs");

// Load env
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=");
      if (key && value) process.env[key.trim()] = value.trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

async function main() {
  const TARGET = "PF3-3079";

  console.log(`\n══════ DEBUG: ${TARGET} ══════\n`);

  // 1) Check what's in Supabase for PF3-3079
  console.log("── 1. Supabase: PF3-3079 record ──");
  const parentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_tickets?jira_key=eq.${TARGET}&select=jira_key,summary,issue_type,parent_key,subtask_keys`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const parentData = await parentRes.json();
  console.log(JSON.stringify(parentData, null, 2));

  // 2) Check tickets where parent_key = PF3-3079
  console.log("\n── 2. Supabase: tickets con parent_key = PF3-3079 ──");
  const childrenRes = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_tickets?parent_key=eq.${TARGET}&select=jira_key,summary,issue_type,parent_key`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const childrenData = await childrenRes.json();
  console.log(`Found ${childrenData.length} tickets with parent_key=${TARGET}`);
  childrenData.forEach(c => console.log(`  - ${c.jira_key} (${c.issue_type}): ${c.summary?.substring(0, 60)}`));

  // 3) Check Jira API directly for PF3-3079
  console.log("\n── 3. Jira API: PF3-3079 ──");
  const jiraRes = await fetch(
    `${JIRA_BASE_URL}/rest/api/3/issue/${TARGET}?fields=summary,subtasks,parent,issuetype`,
    { headers: { Authorization: `Basic ${jiraAuth}`, Accept: "application/json" } }
  );
  const jiraData = await jiraRes.json();
  console.log(`issue_type: ${jiraData.fields?.issuetype?.name}`);
  console.log(`parent: ${jiraData.fields?.parent?.key || "null"}`);
  console.log(`subtasks (${jiraData.fields?.subtasks?.length || 0}):`);
  (jiraData.fields?.subtasks || []).forEach(s => console.log(`  - ${s.key}: ${s.fields?.summary?.substring(0, 60)}`));

  // 4) Check if those subtask keys exist in Supabase
  if (jiraData.fields?.subtasks?.length > 0) {
    const subKeys = jiraData.fields.subtasks.map(s => s.key);
    console.log(`\n── 4. Supabase: checking if subtask keys exist ──`);
    for (const sk of subKeys) {
      const skRes = await fetch(
        `${SUPABASE_URL}/rest/v1/jira_tickets?jira_key=eq.${sk}&select=jira_key,parent_key,issue_type`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const skData = await skRes.json();
      if (skData.length > 0) {
        console.log(`  ✓ ${sk} exists, parent_key=${skData[0].parent_key || "NULL"}, type=${skData[0].issue_type}`);
      } else {
        console.log(`  ✗ ${sk} NOT FOUND in Supabase`);
      }
    }
  }

  console.log("\n══════ END DEBUG ══════\n");
}

main().catch(console.error);
