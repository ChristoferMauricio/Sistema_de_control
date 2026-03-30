const path = require("path");
const fs = require("fs");
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const [key, ...v] = t.split("=");
      if (key && v.length) process.env[key.trim()] = v.join("=").trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // Check if jira_ticket_subtasks table exists and has data
  console.log("── Checking jira_ticket_subtasks table ──");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_ticket_subtasks?select=parent_key,child_key&limit=5`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log(`Response:`, JSON.stringify(data, null, 2));

  // Count total rows
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_ticket_subtasks?select=parent_key&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } }
  );
  console.log(`Total rows: ${countRes.headers.get("content-range")}`);

  // Check for PF3-3079 specifically
  console.log("\n── PF3-3079 in jira_ticket_subtasks ──");
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_ticket_subtasks?parent_key=eq.PF3-3079&select=parent_key,child_key`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  console.log(JSON.stringify(await r2.json(), null, 2));

  // Compare: subtasks from parent_key in jira_tickets
  console.log("\n── PF3-3079 subtasks from jira_tickets.parent_key ──");
  const r3 = await fetch(
    `${SUPABASE_URL}/rest/v1/jira_tickets?parent_key=eq.PF3-3079&select=jira_key,summary`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const children = await r3.json();
  console.log(`Found ${children.length} subtasks via parent_key`);
  children.forEach(c => console.log(`  - ${c.jira_key}: ${c.summary?.substring(0, 50)}`));
}
main().catch(console.error);
