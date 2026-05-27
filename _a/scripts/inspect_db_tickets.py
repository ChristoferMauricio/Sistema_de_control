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

# Let's paginate through all pages to get the full counts
all_tickets = []
page_size = 1000
from_idx = 0

headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}

while True:
    url = f"{supabase_url}/rest/v1/jira_tickets?select=issue_type,sprint&limit={page_size}&offset={from_idx}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            if not data:
                break
            all_tickets.extend(data)
            print(f"Fetched {len(data)} rows (Total: {len(all_tickets)})")
            if len(data) < page_size:
                break
            from_idx += page_size
    except Exception as e:
        print("FAILED:", str(e))
        break

# Breakdown
types = {}
sprints = {}
for t in all_tickets:
    it = t.get("issue_type") or "Unknown"
    types[it] = types.get(it, 0) + 1
    
    sp = t.get("sprint")
    if sp:
        sprints[sp] = sprints.get(sp, 0) + 1

print("\n=== COMPLETE ISSUE TYPE BREAKDOWN ===")
for k, v in sorted(types.items(), key=lambda x: x[1], reverse=True):
    print(f"  - {k}: {v}")

print("\n=== SPRINTS FOUND IN DB (Top 15) ===")
for k, v in sorted(sprints.items(), key=lambda x: x[1], reverse=True)[:15]:
    print(f"  - {k}: {v}")
