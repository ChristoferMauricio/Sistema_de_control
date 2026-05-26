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

# We can trigger the local sync-jira endpoint!
# If the dev server is not running, we can trigger it directly by importing or calling the rest endpoints,
# but wait! We can just call http://localhost:3000/api/sync-jira if it is running.
# Let's try calling http://localhost:3000/api/sync-jira or write a small python script that runs the exact same sync logic as route.js to verify it connects and imports data!
# Let's write the sync script logic to fetch from Atlassian and insert to Supabase.
