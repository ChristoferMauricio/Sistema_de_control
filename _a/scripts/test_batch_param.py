import urllib.request
import json
import urllib.error

env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
gemini_key = ""
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip().startswith("GEMINI_API_KEY="):
            gemini_key = line.strip().split("=")[1].strip()

texts = ["hola", "mundo"]
url = f"https://generativelanguage.googleapis.com/v1/models/gemini-embedding-2:batchEmbedContents?key={gemini_key}"

requests = []
for text in texts:
    requests.append({
        "model": "models/gemini-embedding-2",
        "content": {"parts": [{"text": text}]},
        "outputDimensionality": 768
    })

body = {"requests": requests}

req = urllib.request.Request(
    url,
    data=json.dumps(body).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        embeddings = res_data.get("embeddings", [])
        print(f"SUCCESS! Got {len(embeddings)} embeddings")
        for idx, e in enumerate(embeddings):
            vals = e.get("values", [])
            print(f"  Embedding {idx+1} size: {len(vals)}")
except urllib.error.HTTPError as e:
    err_msg = e.read().decode('utf-8')
    print(f"FAILED (Status: {e.code}) - {err_msg}")
except Exception as e:
    print(f"FAILED - {str(e)}")
