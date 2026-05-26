import urllib.request
import json
import urllib.error

# Load environment variables
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

print("Supabase URL:", supabase_url)
print("Supabase Key loaded:", supabase_key[:10] + "...")

# Query to list pg_catalog extensions
url_query_rpc = f"{supabase_url}/rest/v1/rpc/match_documentos"
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}",
    "Content-Type": "application/json"
}

body = {
    "query_embedding": [0.0] * 768,
    "match_threshold": 0.3,
    "match_count": 5,
    "filter_epic_key": None
}

req = urllib.request.Request(
    url_query_rpc,
    data=json.dumps(body).encode('utf-8'),
    headers=headers
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        print("Success! Response:")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"FAILED (Status: {e.code})")
    print(e.read().decode('utf-8'))
except Exception as e:
    print("FAILED:", str(e))
