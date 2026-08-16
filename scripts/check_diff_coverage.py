"""Require changed executable Python lines to meet a coverage threshold."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HUNK = re.compile(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def changed_lines(base: str, *, working_tree: bool = False) -> dict[str, set[int]]:
    diff_target = base if working_tree else f"{base}...HEAD"
    result = subprocess.run(
        ["git", "diff", "--unified=0", diff_target, "--", "backend"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    current: str | None = None
    lines: dict[str, set[int]] = {}
    for raw in result.stdout.splitlines():
        if raw.startswith("+++ b/"):
            current = raw[6:].replace("\\", "/")
            continue
        match = HUNK.match(raw)
        if not current or not match:
            continue
        start = int(match.group(1))
        count = int(match.group(2) or "1")
        if count:
            lines.setdefault(current, set()).update(range(start, start + count))
    if working_tree:
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "backend"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        for filename in untracked.stdout.splitlines():
            normalized = filename.replace("\\", "/")
            path = ROOT / normalized
            if path.suffix == ".py" and path.is_file():
                line_count = len(path.read_text(encoding="utf-8").splitlines())
                lines.setdefault(normalized, set()).update(range(1, line_count + 1))
    return lines


def executable_lines(report: Path) -> dict[str, dict[int, int]]:
    root = ET.parse(report).getroot()
    result: dict[str, dict[int, int]] = {}
    for class_node in root.findall(".//class"):
        filename = (class_node.get("filename") or "").replace("\\", "/")
        if not filename:
            continue
        if not filename.startswith("backend/"):
            filename = f"backend/{filename}"
        result[filename] = {
            int(line.get("number", "0")): int(line.get("hits", "0"))
            for line in class_node.findall("./lines/line")
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="HEAD^")
    parser.add_argument("--report", type=Path, default=Path("backend/coverage.xml"))
    parser.add_argument("--threshold", type=float, default=80.0)
    parser.add_argument(
        "--working-tree",
        action="store_true",
        help="compare the current tracked working tree to --base (local verification)",
    )
    args = parser.parse_args()

    report = args.report if args.report.is_absolute() else ROOT / args.report
    changed = changed_lines(args.base, working_tree=args.working_tree)
    coverage = executable_lines(report)
    total = covered = 0
    missed: list[str] = []
    for filename, changed_file_lines in sorted(changed.items()):
        if "/tests/" in filename or "/alembic/versions/" in filename:
            continue
        measured = coverage.get(filename, {})
        for line_number in sorted(changed_file_lines & measured.keys()):
            total += 1
            if measured[line_number] > 0:
                covered += 1
            else:
                missed.append(f"{filename}:{line_number}")
    percent = 100.0 if total == 0 else covered * 100.0 / total
    print(f"python_diff_coverage={percent:.2f}% covered={covered} executable_changed={total}")
    if percent < args.threshold:
        for item in missed[:50]:
            print(f"uncovered_changed_line={item}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
