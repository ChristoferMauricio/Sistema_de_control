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
        if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            supabase_key = line.split("=")[1].strip()

# Query total count of issues in jira_tickets bypassing RLS
url = f"{supabase_url}/rest/v1/jira_tickets?select=jira_key"
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}

req = urllib.request.Request(url, headers={**headers, "Prefer": "count=exact"})
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        # Get count from Content-Range header
        headers_dict = dict(response.info())
        cr = headers_dict.get("Content-Range") or headers_dict.get("content-range")
        print("Content-Range Header:", cr)
        data = json.loads(response.read().decode('utf-8'))
        print(f"Total rows fetched: {len(data)}")
except Exception as e:
    print("FAILED:", str(e))
