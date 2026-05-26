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

url = f"{supabase_url}/rest/v1/jira_persons?select=email,display_name"
headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode('utf-8'))
        print("Persons in database:")
        for idx, p in enumerate(data):
            print(f"  {idx+1}. Email: {p['email']} | Name: {p['display_name']}")
except Exception as e:
    print("FAILED:", str(e))
