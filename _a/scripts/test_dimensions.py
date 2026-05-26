import urllib.request
import json
import urllib.error

env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
gemini_key = ""
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip().startswith("GEMINI_API_KEY="):
            gemini_key = line.strip().split("=")[1].strip()

print("Loaded key:", gemini_key[:8] + "...")

tests = [
    ("gemini-embedding-2", f"https://generativelanguage.googleapis.com/v1/models/gemini-embedding-2:embedContent?key={gemini_key}", {
        "model": "models/gemini-embedding-2",
        "content": {"parts": [{"text": "hola"}]}
    }),
    ("gemini-embedding-001", f"https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent?key={gemini_key}", {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": "hola"}]}
    }),
]

for name, url, body in tests:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            vals = res_data.get("embedding", {}).get("values", [])
            print(f"[{name}] SUCCESS! Vector size: {len(vals)}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8')
        print(f"[{name}] FAILED (Status: {e.code}) - {err_msg}")
    except Exception as e:
        print(f"[{name}] FAILED - {str(e)}")
