import json
import sys

if len(sys.argv) < 2:
    print("Usage: python _update_version.py <version>")
    sys.exit(1)

new_version = sys.argv[1]

with open("package.json", "r", encoding="utf-8") as f:
    pkg = json.load(f)

pkg["version"] = new_version

with open("package.json", "w", encoding="utf-8") as f:
    json.dump(pkg, f, indent=2)
    f.write("\n")

print(f"Version updated to {new_version}")