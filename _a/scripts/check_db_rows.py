import urllib.request
import json
import urllib.error

env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
supabase_url = ""
supabase_key = ""

with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            supabase_url = line.split("=")[1].strip()
        if line.startswith("NEXT_PUBLIC_SUPABASE_ANON_KEY="):
            supabase_key = line.split("=")[1].strip()

tables = ["jira_tickets", "jira_persons", "jira_ticket_subtasks", "jira_ticket_links", "jira_ticket_status_history", "documentos_embeddings"]
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Range-Unit": "items"
}

print("Checking table row counts in Supabase:")
for table in tables:
    url = f"{supabase_url}/rest/v1/{table}?select=count"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            count_data = json.loads(response.read().decode('utf-8'))
            print(f"  - {table}: {count_data}")
    except urllib.error.HTTPError as e:
        print(f"  - {table}: FAILED! Status: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"  - {table}: FAILED: {str(e)}")
