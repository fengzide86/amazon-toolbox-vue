"""Check that the enriched OpenAPI document keeps the frozen HTTP surface."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def operations(schema: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for route, path_item in schema.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method in HTTP_METHODS and isinstance(operation, dict):
                result[(route, method)] = operation
    return result


def parameter_signature(operation: dict[str, Any]) -> list[tuple[str, str, bool]]:
    signature: list[tuple[str, str, bool]] = []
    for parameter in operation.get("parameters", []):
        if not isinstance(parameter, dict):
            continue
        signature.append(
            (
                str(parameter.get("name", "")),
                str(parameter.get("in", "")),
                bool(parameter.get("required", False)),
            )
        )
    return sorted(signature)


def compare(baseline: dict[str, Any], current: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    baseline_ops = operations(baseline)
    current_ops = operations(current)
    if baseline_ops.keys() != current_ops.keys():
        missing = sorted(baseline_ops.keys() - current_ops.keys())
        added = sorted(current_ops.keys() - baseline_ops.keys())
        if missing:
            errors.append(f"operations removed: {missing}")
        if added:
            errors.append(f"operations added: {added}")
    for key in sorted(baseline_ops.keys() & current_ops.keys()):
        before = baseline_ops[key]
        after = current_ops[key]
        if parameter_signature(before) != parameter_signature(after):
            errors.append(f"parameters changed for {key[1].upper()} {key[0]}")
        if bool(before.get("requestBody")) != bool(after.get("requestBody")):
            errors.append(f"request body presence changed for {key[1].upper()} {key[0]}")
        before_codes = set(before.get("responses", {}).keys())
        after_codes = set(after.get("responses", {}).keys())
        if not before_codes.issubset(after_codes):
            errors.append(f"response codes removed for {key[1].upper()} {key[0]}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, default=Path("backend/openapi-baseline.json"))
    parser.add_argument("--current", type=Path, default=Path("backend/openapi.json"))
    args = parser.parse_args()
    baseline_path = args.baseline if args.baseline.is_absolute() else ROOT / args.baseline
    current_path = args.current if args.current.is_absolute() else ROOT / args.current
    errors = compare(load(baseline_path), load(current_path))
    if errors:
        for error in errors:
            print(f"openapi_compat_error={error}", file=sys.stderr)
        return 1
    print(f"openapi_compatibility=verified operations={len(operations(load(current_path)))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
