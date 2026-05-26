with open(r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a\app\api\sync-jira\route.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines, 1):
    if "rest/api/2" in line:
        print(f"Line {idx}: {line.strip()}")
