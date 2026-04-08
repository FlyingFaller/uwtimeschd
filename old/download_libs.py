import urllib.request
import os

# The 3 core files needed for HTTP Range Request SQLite
files = {
    "js/lib/index.js": "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@8.4.0/+esm",
    "js/lib/sqlite.worker.js": "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@8.4.0/dist/sqlite.worker.js",
    "js/lib/sql-wasm.wasm": "https://cdn.jsdelivr.net/npm/sql.js-httpvfs@8.4.0/dist/sql-wasm.wasm"
}

os.makedirs("js/lib", exist_ok=True)

print("Vendoring sql.js-httpvfs locally to bypass browser blocks...")
for local_path, url in files.items():
    print(f"Downloading -> {local_path}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        with open(local_path, 'wb') as f:
            f.write(response.read())

print("\nSuccess! You can now delete this script.")