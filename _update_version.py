import json
import sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: python _update_version.py <version>")
    sys.exit(1)

new_version = sys.argv[1].strip()
if not new_version:
    print("Version cannot be empty")
    sys.exit(1)

def update_json(path: Path, update):
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    update(data)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

update_json(Path("package.json"), lambda pkg: pkg.__setitem__("version", new_version))

lock_file = Path("package-lock.json")
if lock_file.exists():
    def update_lock(lock):
        lock["version"] = new_version
        root_package = lock.get("packages", {}).get("")
        if isinstance(root_package, dict):
            root_package["version"] = new_version

    update_json(lock_file, update_lock)

print(f"Version updated to {new_version} (package.json and package-lock.json)")
