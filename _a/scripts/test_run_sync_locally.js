const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Manual env loader
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const processEnv = {};
envContent.split("\n").forEach(line => {
  const parts = line.split("=");
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
    processEnv[key] = val;
  }
});

const JIRA_BASE_URL = (processEnv.JIRA_BASE_URL || "").replace(/\/+$/, "");
const JIRA_USER_EMAIL = processEnv.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = processEnv.JIRA_API_TOKEN;
const JIRA_PROJECT_KEY = processEnv.JIRA_PROJECT_KEY || "";
const SUPABASE_URL = processEnv.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = processEnv.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const jiraHeaders = {
  Authorization: `Basic ${Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function getEpicLinkFieldId() {
  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/field`, {
      method: "GET",
      headers: jiraHeaders,
    });
    if (!res.ok) {
      console.log("Field response not OK:", res.status);
      return null;
    }
    const fields = await res.json();
    const epicField = fields.find(
      (f) =>
        f.name?.toLowerCase().includes("epic link") ||
        f.name?.toLowerCase().includes("enlace de épica") ||
        f.name?.toLowerCase().includes("enlace épica")
    );
    return epicField?.id ?? null;
  } catch (e) {
    console.log("Error in getEpicLinkFieldId:", e.message);
    return null;
  }
}

async function searchJira(jql, epicLinkFieldId) {
  const allIssues = [];
  const baseFields = "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10036,customfield_10020,customfield_10014,description,issuelinks,labels";
  const fields = epicLinkFieldId && epicLinkFieldId !== "customfield_10014"
    ? `${baseFields},${epicLinkFieldId}`
    : baseFields;

  let nextPageToken = null;
  while (true) {
    const params = new URLSearchParams({ jql, maxResults: "100", fields });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql?${params}`;
    console.log("Fetching url:", url);
    const res = await fetch(url, {
      method: "GET",
      headers: jiraHeaders,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`Error res not OK (${res.status}):`, errText);
      throw new Error(`Jira API (${res.status}): ${errText}`);
    }

    const data = await res.json();
    console.log(`Fetched page of issues: ${data.issues?.length || 0}`);
    allIssues.push(...(data.issues || []));

    if (!data.nextPageToken || !data.issues?.length) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

async function runSync() {
  try {
    console.log("Starting JIRA sync local runner...");
    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      const projects = JIRA_PROJECT_KEY.split(",").map(p => `"${p.trim()}"`).join(", ");
      jql = `project in (${projects}) ORDER BY updated DESC`;
    }
    console.log("JQL query:", jql);

    const epicLinkFieldId = await getEpicLinkFieldId();
    console.log("Epic field ID:", epicLinkFieldId);

    const issues = await searchJira(jql, epicLinkFieldId);
    console.log("Total issues fetched from Atlassian Jira:", issues.length);
  } catch (err) {
    console.error("Critical error in sync runner:", err.message);
  }
}

runSync();
