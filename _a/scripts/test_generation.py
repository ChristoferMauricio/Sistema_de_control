import urllib.request
import json
import urllib.error

env_path = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\.env.local"
gemini_key = ""
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        if line.strip().startswith("GEMINI_API_KEY="):
            gemini_key = line.strip().split("=")[1].strip()

url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={gemini_key}"
body = {
    "contents": [{
        "parts": [{"text": "dime 'hola' en 2 palabras"}]
    }]
}

req = urllib.request.Request(
    url,
    data=json.dumps(body).encode('utf-8'),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode('utf-8'))
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        print("SUCCESS! Output:", text.strip())
except urllib.error.HTTPError as e:
    print(f"FAILED (Status: {e.code}) - {e.read().decode('utf-8')}")
except Exception as e:
    print("FAILED:", str(e))
