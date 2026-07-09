"""Audit tracked files (and optionally Git history) without printing secret values."""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

PATTERNS = [
    re.compile(r"(?i)(server_password|ssh_password)\s*=\s*['\"][^'\"]{6,}['\"]"),
    re.compile(r"(?i)(mysql_password|jwt_secret_key|api_key)\s*=\s*['\"][^'\"]{8,}['\"]"),
]
SAFE_MARKERS = ("os.getenv", "os.environ", "replace-with", "your_", "example", "placeholder")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True, encoding="utf-8", errors="replace")


def suspicious_lines(content: str) -> list[int]:
    hits = []
    for number, line in enumerate(content.splitlines(), 1):
        lowered = line.lower()
        if any(marker in lowered for marker in SAFE_MARKERS):
            continue
        if any(pattern.search(line) for pattern in PATTERNS):
            hits.append(number)
    return hits


def tracked_files() -> list[str]:
    return [line for line in git("ls-files").splitlines() if Path(line).suffix.lower() in {".py", ".js", ".cjs", ".yml", ".yaml", ".env", ".bat"}]


def audit_revision(revision: str, files: list[str]) -> list[tuple[str, int]]:
    findings = []
    for file in files:
        try:
            content = git("show", f"{revision}:{file}") if revision != "WORKTREE" else Path(file).read_text(encoding="utf-8", errors="replace")
        except (subprocess.CalledProcessError, OSError):
            continue
        findings.extend((file, line) for line in suspicious_lines(content))
    return findings


def audit_history_revision(revision: str) -> list[tuple[str, int]]:
    expression = r"(server_password|ssh_password|mysql_password|jwt_secret_key|api_key)[[:space:]]*=[[:space:]]*['\"][^'\"]{6,}['\"]"
    command = [
        "git", "grep", "-n", "-I", "-i", "-E", expression, revision, "--",
        "*.py", "*.js", "*.cjs", "*.yml", "*.yaml", "*.env", "*.bat",
    ]
    result = subprocess.run(command, text=True, encoding="utf-8", errors="replace", capture_output=True)
    findings = []
    for raw in result.stdout.splitlines():
        try:
            _commit, file, line, content = raw.split(":", 3)
        except ValueError:
            continue
        if file.startswith(".clinerules/"):
            continue
        if any(marker in content.lower() for marker in SAFE_MARKERS):
            continue
        findings.append((file, int(line)))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    files = tracked_files()
    findings = [("WORKTREE", *hit) for hit in audit_revision("WORKTREE", files)]
    if args.history:
        unique_history = {}
        for revision in git("rev-list", "--all").splitlines():
            for file, line in audit_history_revision(revision):
                unique_history.setdefault((file, line), revision)
        findings.extend((revision, file, line) for (file, line), revision in unique_history.items())

    for revision, file, line in findings:
        print(f"{revision[:12]} {file}:{line}")
    print(f"secret_findings={len(findings)}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
