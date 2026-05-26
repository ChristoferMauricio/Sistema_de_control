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

def check_endpoint(endpoint):
    url = f"{supabase_url}/rest/v1/{endpoint}?limit=1"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"[{endpoint}] EXISTS! Status: {response.status}")
    except urllib.error.HTTPError as e:
        print(f"[{endpoint}] FAILED! Status: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"[{endpoint}] FAILED: {str(e)}")

check_endpoint("jira_tickets")
check_endpoint("documentos_embeddings")
