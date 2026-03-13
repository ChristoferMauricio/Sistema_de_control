// Test script to fetch Jira v2 API and print the first 3 subtasks' descriptions
const JIRA_BASE_URL = "https://supervisorservicio2020.atlassian.net";
const JIRA_USER_EMAIL = "cromero@osinergmin.gob.pe";
const JIRA_API_TOKEN = "ATATT3xFfGF0d1nUu5eUa74F0g4Z0X3c1g1o0D3y4j6P4f6B0G7H4e1N7k1I2q3L2a4Y8x4R6k1V8s1X6r0G8w3X3s4Q8p4W5w6m5g4F5y8t0D9o7G1n3q6K3k5V1e9W8I7d1d2s5l2d7R1w9B4S7A7r3K6W6P1b6h3y8A=77B907FA";

const jiraAuth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
const jiraHeaders = {
  Authorization: `Basic ${jiraAuth}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function testJiraSync() {
  const jql = 'parent in ("PF3-1799", "PF3-1800", "PF3QA-49", "PF3QA-50") AND issuetype = "Subtarea" ORDER BY updated DESC';
  
  const fields = "key,summary,description";
  const params = new URLSearchParams({
    jql,
    maxResults: "5",
    fields,
  });

  const url = `${JIRA_BASE_URL}/rest/api/2/search/jql?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: jiraHeaders,
  });

  const data = await response.json();
  
  console.log("Found issues:", data.issues?.length || 0);
  if (data.issues) {
    data.issues.forEach(issue => {
      console.log(`\n=== TICKET: ${issue.key} ===`);
      console.log(`Summary: ${issue.fields.summary}`);
      
      const desc = issue.fields.description;
      if (!desc) {
          console.log("Description: NULL");
      } else if (typeof desc === 'string') {
          console.log(`Description (String):`);
          console.log(desc.substring(0, 150) + "...");
      } else {
          console.log("Description is ADF Object (v3 format). Example:");
          console.log(JSON.stringify(desc).substring(0, 150) + "...");
          
          // Let's try to extract from ADF if it IS an ADF object
          console.log("\nAttempting ADF extraction:");
          let fullText = "";
          try {
             const extractText = (nodes) => {
                 if (!nodes) return;
                 for (const node of nodes) {
                     if (node.type === 'text' && node.text) {
                         fullText += node.text + " ";
                     } else if (node.content) {
                         extractText(node.content);
                     }
                 }
             };
             if (desc.content) extractText(desc.content);
             console.log("Extracted text:", fullText.substring(0, 150) + "...");
          } catch (e) {
             console.log("Failed extracting text");
          }
      }
    });
  }
}

testJiraSync();
