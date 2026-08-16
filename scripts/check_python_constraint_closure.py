"""Fail when an installed Python dependency is not pinned by constraints."""

from __future__ import annotations

import argparse
import re
from importlib.metadata import distributions
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_DISTRIBUTIONS = {"pip", "setuptools", "wheel"}


def canonicalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def constraint_pins(path: Path) -> set[str]:
    pins: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if "==" not in line:
            continue
        name, version = line.split("==", 1)
        if name.strip() and version.strip():
            pins.add(canonicalize(name.strip()))
    return pins


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--constraints",
        type=Path,
        default=Path("backend/constraints-py310.txt"),
    )
    args = parser.parse_args()
    constraints = (
        args.constraints if args.constraints.is_absolute() else ROOT / args.constraints
    )

    pinned = constraint_pins(constraints)
    installed = {
        canonicalize(str(distribution.metadata["Name"]))
        for distribution in distributions()
        if distribution.metadata["Name"]
    }
    missing = sorted(installed - pinned - BOOTSTRAP_DISTRIBUTIONS)
    if missing:
        parser.error(
            "installed distributions missing exact constraints: " + ", ".join(missing)
        )

    print(
        f"python_constraints=complete installed={len(installed)} pinned={len(pinned)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
