const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i !== -1) {
    const key = line.substring(0, i).trim();
    const value = line.substring(i + 1).trim();
    if (key) process.env[key] = value;
  }
});

async function checkJiraIssue() {
  const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || "").replace(/\/+$/, "");
  const auth = Buffer.from(`${process.env.JIRA_USER_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  
  // Try to find a recent bug in PF3QA
  const jql = encodeURIComponent('project = "PF3QA" ORDER BY created DESC');
  const url = `${JIRA_BASE_URL}/rest/api/2/search/jql?jql=${jql}&maxResults=50&fields=issuelinks,customfield_10020,issuetype`;

  console.log("Fetching: " + url);
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json"
    }
  });

  const data = await res.json();
  const linkedIssues = (data.issues || []).filter(i => i.fields.issuelinks && i.fields.issuelinks.length > 0);
  
  fs.writeFileSync('pf3qa_bug.json', JSON.stringify(linkedIssues, null, 2));
  console.log(`Written ${linkedIssues.length} issues to pf3qa_bug.json`);
}

checkJiraIssue();
