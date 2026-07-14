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
    if (!res.ok) return null;
    const fields = await res.json();
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

async function searchJira(jql, epicLinkFieldId) {
  const allIssues = [];
  const baseFields = "key,summary,status,assignee,priority,issuetype,created,updated,reporter,parent,subtasks,customfield_10036,customfield_10020,customfield_10014,description,issuelinks,labels";
  const fields = epicLinkFieldId && epicLinkFieldId !== "customfield_10014"
    ? `${baseFields},${epicLinkFieldId}`
    : baseFields;

  let nextPageToken = null;
  while (true) {
    const params = new URLSearchParams({ jql, maxResults: "100", fields, expand: "changelog" });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql?${params}`, {
      method: "GET",
      headers: jiraHeaders,
    });

    if (!res.ok) throw new Error(`Jira API (${res.status}): ${await res.text()}`);

    const data = await res.json();
    allIssues.push(...(data.issues || []));
    console.log(`Fetched ${data.issues?.length || 0} issues (Total: ${allIssues.length})`);

    if (!data.nextPageToken || !data.issues?.length) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues;
}

function extractSprintName(sprintField) {
  if (!Array.isArray(sprintField) || sprintField.length === 0) return null;
  const active = sprintField.find(s => s.state === "active") ?? sprintField[sprintField.length - 1];
  return active?.name ?? null;
}

function extractFirstSprintFromHistory(issue) {
  const changelog = issue.changelog;
  const sprintField = issue.fields?.customfield_10020;

  if (changelog?.histories?.length) {
    const sprintChanges = [];
    for (const h of changelog.histories) {
      for (const item of h.items) {
        if (item.field === "Sprint") {
          sprintChanges.push({
            date: h.created,
            fromString: item.fromString,
            toString: item.toString,
          });
        }
      }
    }

    if (sprintChanges.length > 0) {
      // Changelog from search/jql is in descending order (newest first).
      // Search from the end (oldest) for the first sprint assignment.
      for (let i = sprintChanges.length - 1; i >= 0; i--) {
        const sc = sprintChanges[i];
        if (!sc.fromString || sc.fromString === "") {
          return sc.toString?.split(",")[0]?.trim() || null;
        }
      }
      const oldest = sprintChanges[sprintChanges.length - 1];
      return oldest.fromString?.split(",")[0]?.trim() || oldest.toString?.split(",")[0]?.trim() || null;
    }
  }

  // Fallback: no changelog Sprint changes → sprint was set at creation
  if (Array.isArray(sprintField) && sprintField.length > 0) {
    return sprintField[0]?.name ?? null;
  }

  return null;
}

function transformIssue(issue, epicLinkFieldId) {
  const f = issue.fields || {};
  const now = new Date().toISOString();

  const assigneeId = f.assignee?.emailAddress || f.assignee?.accountId || "";
  const reporterId = f.reporter?.emailAddress  || f.reporter?.accountId  || "";
  const epicLinkKey = epicLinkFieldId ? (f[epicLinkFieldId] ?? null) : null;

  const ticket = {
    jira_key:       issue.key,
    summary:        f.summary       || "",
    description:    f.description   || null,
    status:         f.status?.name  || "",
    assignee_email: assigneeId,
    priority:       f.priority?.name || "",
    issue_type:     f.issuetype?.name || "",
    sprint:         extractSprintName(f.customfield_10020),
    created_sprint: extractFirstSprintFromHistory(issue),
    story_points:   f.customfield_10036 ?? null,
    reporter_email: reporterId,
    parent_key:     f.parent?.key || f.customfield_10014 || epicLinkKey || null,
    created_at:     f.created       || null,
    updated_at:     f.updated       || null,
    synced_at:      now,
    labels:         Array.isArray(f.labels) && f.labels.length > 0 ? f.labels : null,
  };

  const persons = [];
  if (assigneeId) {
    persons.push({ email: assigneeId, display_name: f.assignee.displayName || assigneeId });
  }
  if (reporterId) {
    persons.push({ email: reporterId, display_name: f.reporter.displayName || reporterId });
  }

  const subtasks = (f.subtasks || []).map(s => ({
    parent_key: issue.key,
    child_key:  s.key,
  }));

  const links = (f.issuelinks || [])
    .map(l => {
      const targetKey = l.inwardIssue?.key ?? l.outwardIssue?.key;
      const linkType  = l.inwardIssue ? (l.type?.inward ?? "inward") : (l.type?.outward ?? "outward");
      return targetKey ? { source_key: issue.key, target_key: targetKey, link_type: linkType } : null;
    })
    .filter(Boolean);

  return { ticket, persons, subtasks, links };
}

async function runSync() {
  try {
    console.log("=== STARTING FULL SUPABASE SYNC ===");
    let jql = "ORDER BY updated DESC";
    if (JIRA_PROJECT_KEY) {
      const projects = JIRA_PROJECT_KEY.split(",").map(p => `"${p.trim()}"`).join(", ");
      jql = `project in (${projects}) ORDER BY updated DESC`;
    }

    const epicLinkFieldId = await getEpicLinkFieldId();
    console.log("Discovered Epic Link Field:", epicLinkFieldId);

    const issues = await searchJira(jql, epicLinkFieldId);
    console.log(`Fetched ${issues.length} issues from Atlassian Jira.`);

    const transformed = issues.map(i => transformIssue(i, epicLinkFieldId));
    const tickets  = transformed.map(t => t.ticket);
    const jiraKeys = tickets.map(t => t.jira_key);

    const personsMap = new Map();
    transformed.forEach(({ persons }) =>
      persons.forEach(p => personsMap.set(p.email, p))
    );
    const allPersons = [...personsMap.values()];
    const allSubtasks = transformed.flatMap(t => t.subtasks);
    const allLinks    = transformed.flatMap(t => t.links);

    console.log("Deduplicated persons count:", allPersons.length);
    console.log("Total subtasks count:", allSubtasks.length);
    console.log("Total links count:", allLinks.length);

    const statusMap = {};
    const batchSize = 200;
    for (let i = 0; i < jiraKeys.length; i += batchSize) {
      const { data } = await supabaseAdmin
        .from("jira_tickets")
        .select("jira_key, status")
        .in("jira_key", jiraKeys.slice(i, i + batchSize));
      for (const t of data || []) statusMap[t.jira_key] = t.status;
    }

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

    console.log("Status changes to log:", statusChanges.length);

    // Upsert persons
    if (allPersons.length > 0) {
      console.log("Upserting persons...");
      for (let i = 0; i < allPersons.length; i += batchSize) {
        await supabaseAdmin
          .from("jira_persons")
          .upsert(allPersons.slice(i, i + batchSize), { onConflict: "email" });
      }
    }

    // Upsert tickets (batch of 500)
    const upsertBatch = 500;
    console.log("Upserting tickets...");
    for (let i = 0; i < tickets.length; i += upsertBatch) {
      const { error } = await supabaseAdmin
        .from("jira_tickets")
        .upsert(tickets.slice(i, i + upsertBatch), { onConflict: "jira_key" });
      if (error) throw new Error(`Supabase upsert tickets (lote ${i}): ${error.message}`);
      console.log(`  - Upserted tickets ${i} to ${Math.min(i + upsertBatch, tickets.length)}`);
    }

    // Upsert subtasks
    if (allSubtasks.length > 0) {
      console.log("Upserting subtasks...");
      for (let i = 0; i < allSubtasks.length; i += upsertBatch) {
        await supabaseAdmin
          .from("jira_ticket_subtasks")
          .upsert(allSubtasks.slice(i, i + upsertBatch), { onConflict: "parent_key,child_key" });
      }
    }

    // Upsert links
    if (allLinks.length > 0) {
      console.log("Upserting links...");
      for (let i = 0; i < allLinks.length; i += upsertBatch) {
        await supabaseAdmin
          .from("jira_ticket_links")
          .upsert(allLinks.slice(i, i + upsertBatch), { onConflict: "source_key,target_key" });
      }
    }

    // Log status changes
    if (statusChanges.length > 0) {
      console.log("Logging status changes...");
      for (let i = 0; i < statusChanges.length; i += upsertBatch) {
        await supabaseAdmin
          .from("jira_ticket_status_history")
          .insert(statusChanges.slice(i, i + upsertBatch));
      }
    }

    console.log("=== SYNC COMPLETED SUCCESSFULLY! ===");
  } catch (err) {
    console.error("Critical error in sync:", err.message);
  }
}

runSync();
