"""Enforce backend HTTP contracts and incremental module boundaries."""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ROUTE_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
TRANSACTION_METHODS = {"commit", "rollback"}


def dotted_name(node: ast.AST) -> str:
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def is_route_decorator(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in ROUTE_METHODS
        and dotted_name(node.func.value).endswith("router")
    )


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def inspect_router(path: Path) -> tuple[list[str], list[str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    missing_models: list[str] = []
    transaction_calls: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        route_decorators = [decorator for decorator in node.decorator_list if is_route_decorator(decorator)]
        for decorator in route_decorators:
            assert isinstance(decorator, ast.Call)
            if not any(keyword.arg == "response_model" for keyword in decorator.keywords):
                missing_models.append(f"{relative(path)}:{node.lineno}:{node.name}")
        if route_decorators:
            for child in ast.walk(node):
                if not isinstance(child, ast.Call) or not isinstance(child.func, ast.Attribute):
                    continue
                if child.func.attr in TRANSACTION_METHODS:
                    transaction_calls.append(
                        f"{relative(path)}:{node.name}:{child.func.attr}"
                    )
    return missing_models, transaction_calls


def inspect_domain(path: Path) -> tuple[list[str], list[str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    router_imports: list[str] = []
    cross_domain_imports: list[str] = []
    owner_parts = path.relative_to(BACKEND / "domains").parts
    owner = owner_parts[0] if owner_parts else ""
    for node in ast.walk(tree):
        module = ""
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("routers"):
                    router_imports.append(f"{relative(path)}:{node.lineno}:{alias.name}")
            continue
        if module.startswith("routers"):
            router_imports.append(f"{relative(path)}:{node.lineno}:{module}")
        if module.startswith("domains."):
            target = module.split(".", 2)[1]
            public_contract = module == f"domains.{target}"
            if owner and target != owner and not public_contract:
                cross_domain_imports.append(f"{relative(path)}:{node.lineno}:{module}")
    return router_imports, cross_domain_imports


def inspect_untyped_functions(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    untyped: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        arguments = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
        missing_argument = any(
            argument.arg not in {"self", "cls"} and argument.annotation is None
            for argument in arguments
        )
        if node.args.vararg and node.args.vararg.annotation is None:
            missing_argument = True
        if node.args.kwarg and node.args.kwarg.annotation is None:
            missing_argument = True
        if missing_argument or node.returns is None:
            untyped.append(f"{relative(path)}:{node.name}")
    return untyped


def snapshot() -> dict[str, list[str]]:
    missing_models: list[str] = []
    transaction_calls: list[str] = []
    for path in sorted((BACKEND / "routers").glob("*.py")):
        missing, transactions = inspect_router(path)
        missing_models.extend(missing)
        transaction_calls.extend(transactions)

    router_imports: list[str] = []
    cross_domain_imports: list[str] = []
    for path in sorted((BACKEND / "domains").rglob("*.py")):
        routers, cross_domain = inspect_domain(path)
        router_imports.extend(routers)
        cross_domain_imports.extend(cross_domain)
    untyped_functions: list[str] = []
    for folder in ("app", "core", "domains", "services", "routers"):
        for path in sorted((BACKEND / folder).rglob("*.py")):
            untyped_functions.extend(inspect_untyped_functions(path))
    return {
        "router_transaction_calls": sorted(set(transaction_calls)),
        "domain_router_imports": sorted(set(router_imports)),
        "cross_domain_imports": sorted(set(cross_domain_imports)),
        "routes_missing_response_model": sorted(set(missing_models)),
        "untyped_functions": sorted(set(untyped_functions)),
    }


def added(current: dict[str, list[str]], baseline: dict[str, list[str]], key: str) -> list[str]:
    return sorted(set(current.get(key, [])) - set(baseline.get(key, [])))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path("backend/architecture-baseline.json"),
    )
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()
    baseline_path = args.baseline if args.baseline.is_absolute() else ROOT / args.baseline
    current = snapshot()
    if args.write_baseline:
        baseline_path.write_text(
            json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"architecture_baseline=written path={relative(baseline_path)}")
        return 0
    baseline: dict[str, Any] = json.loads(baseline_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    if current["routes_missing_response_model"]:
        errors.extend(
            f"route missing response_model: {item}"
            for item in current["routes_missing_response_model"]
        )
    for key in ("router_transaction_calls", "domain_router_imports", "cross_domain_imports", "untyped_functions"):
        errors.extend(f"new {key}: {item}" for item in added(current, baseline, key))
    if errors:
        for error in errors:
            print(f"architecture_error={error}", file=sys.stderr)
        return 1
    print(
        "architecture_boundaries=verified "
        f"router_transaction_baseline={len(current['router_transaction_calls'])} "
        f"domain_router_imports={len(current['domain_router_imports'])} "
        f"cross_domain_imports={len(current['cross_domain_imports'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
