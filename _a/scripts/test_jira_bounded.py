import urllib.request
import json
import urllib.error
import base64

# Load JIRA credentials from .env.local
env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
jira_url = ""
jira_user = ""
jira_token = ""

with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line.startswith("JIRA_BASE_URL="):
            jira_url = line.split("=")[1].strip()
        if line.startswith("JIRA_USER_EMAIL="):
            jira_user = line.split("=")[1].strip()
        if line.startswith("JIRA_API_TOKEN="):
            jira_token = line.split("=")[1].strip()

auth_str = f"{jira_user}:{jira_token}"
auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')

# Try JQL query with 10 year boundary
jql = "created >= -3650d ORDER BY updated DESC"
url = f"{jira_url}/rest/api/3/search/jql?jql={urllib.parse.quote(jql)}&maxResults=10"

req = urllib.request.Request(url, headers={
    "Authorization": f"Basic {auth_b64}",
    "Content-Type": "application/json"
})

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode('utf-8'))
        print(f"SUCCESS! Total issues in last 10 years: {data.get('total', 0)}")
        for issue in data.get("issues", []):
            summary = issue['fields'].get('summary', {}).get('value', '') if isinstance(issue['fields'].get('summary'), dict) else issue['fields'].get('summary')
            print(f"  - Key: {issue['key']} | Summary: {summary} | Project: {issue['fields'].get('project', {}).get('key')}")
except urllib.error.HTTPError as e:
    print(f"FAILED! Status: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print("FAILED:", str(e))
