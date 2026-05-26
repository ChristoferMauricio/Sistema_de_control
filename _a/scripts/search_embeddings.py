import os

root_dir = r"d:\OneDrive_UNI\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\Desktop\PGIM\_SISTEMA\Sistema_de_control\_a"
exclude_dirs = {".git", ".next", "node_modules"}

matches = []
for dirpath, dirnames, filenames in os.walk(root_dir):
    dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
    for filename in filenames:
        if filename.endswith((".js", ".jsx", ".ts", ".tsx", ".json", ".sql")):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for idx, line in enumerate(f, 1):
                        if "text-embedding-004" in line:
                            matches.append((filepath, idx, line.strip()))
            except Exception as e:
                pass

print(f"Found {len(matches)} occurrences:")
for filepath, idx, line in matches:
    print(f"{os.path.basename(filepath)}:{idx}: {line}")
