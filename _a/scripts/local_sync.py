import urllib.request
import json
import urllib.error
import base64

# Load JIRA & Supabase credentials
env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
jira_url = ""
jira_user = ""
jira_token = ""
jira_projects = ""
supabase_url = ""
supabase_key = ""

with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line.startswith("JIRA_BASE_URL="):
            jira_url = line.split("=")[1].strip()
        if line.startswith("JIRA_USER_EMAIL="):
            jira_user = line.split("=")[1].strip()
        if line.startswith("JIRA_API_TOKEN="):
            jira_token = line.split("=")[1].strip()
        if line.startswith("JIRA_PROJECT_KEY="):
            jira_projects = line.split("=")[1].strip()
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            supabase_url = line.split("=")[1].strip()
        if line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
            supabase_key = line.split("=")[1].strip()

auth_str = f"{jira_user}:{jira_token}"
auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')

# Search for fields
def get_epic_field_id():
    url = f"{jira_url}/rest/api/3/field"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth_b64}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            fields = json.loads(response.read().decode('utf-8'))
            epic_field = next((f for f in fields if any(name in (f.get("name") or "").lower() for name in ["epic link", "enlace de épica", "enlace épica"])), None)
            return epic_field.get("id") if epic_field else None
    except Exception as e:
        print("Failed to get field id:", e)
        return None

# Search JIRA
epic_field_id = get_epic_field_id()
print("Epic Link Field ID discovered:", epic_field_id)

# Query JIRA
jql = f"created >= -3650d ORDER BY updated DESC"
print("Running JQL query:", jql)
url = f"{jira_url}/rest/api/3/search/jql?jql={urllib.parse.quote(jql)}&maxResults=50"
req = urllib.request.Request(url, headers={
    "Authorization": f"Basic {auth_b64}",
    "Content-Type": "application/json"
})

try:
    with urllib.request.urlopen(req, timeout=15) as response:
        data = json.loads(response.read().decode('utf-8'))
        issues = data.get("issues", [])
        print(f"Total issues fetched from Jira: {len(issues)}")
        for i in issues[:5]:
            print(f"  - Key: {i['key']} | Summary: {i['fields'].get('summary')} | Project: {i['fields'].get('project', {}).get('key')}")
except urllib.error.HTTPError as e:
    print("FAILED:", e.code)
    print(e.read().decode('utf-8'))
except Exception as e:
    print("FAILED:", e)
