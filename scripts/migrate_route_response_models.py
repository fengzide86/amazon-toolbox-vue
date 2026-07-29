"""One-time source migration: make every FastAPI route response model explicit."""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTERS = ROOT / "backend" / "routers"
METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
# The compatibility contract preserves FastAPI's legacy `jsonable_encoder`
# behaviour for mappings, lists, scalars, and ORM objects. Domain-specific DTOs
# can replace it incrementally without forcing a wire-format migration.
MODEL = "response_model=CompatibleResponse"
MODEL_IMPORT = "from core.response import CompatibleResponse"


def route_call(node: ast.AST) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in METHODS
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "router"
    )


def migrate(path: Path) -> int:
    source = path.read_text(encoding="utf-8")
    source = source.replace("response_model=object", MODEL)
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    offsets: list[int] = []
    cursor = 0
    for line in lines:
        offsets.append(cursor)
        cursor += len(line)
    insertions: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not route_call(decorator):
                continue
            assert isinstance(decorator, ast.Call)
            if any(keyword.arg == "response_model" for keyword in decorator.keywords):
                continue
            assert decorator.end_lineno is not None and decorator.end_col_offset is not None
            insertion = offsets[decorator.end_lineno - 1] + decorator.end_col_offset - 1
            insertions.append((insertion, f", {MODEL}"))
    for insertion, value in sorted(insertions, reverse=True):
        source = source[:insertion] + value + source[insertion:]
    needs_model_import = MODEL in source and MODEL_IMPORT not in source
    if needs_model_import:
        import_lines = [
            index
            for index, line in enumerate(source.splitlines())
            if line.startswith("from core.") or line.startswith("import core.")
        ]
        if not import_lines:
            raise RuntimeError(f"cannot place compatibility response import: {path}")
        source_lines = source.splitlines(keepends=True)
        source_lines.insert(import_lines[-1] + 1, f"{MODEL_IMPORT}\n")
        source = "".join(source_lines)
    if insertions or needs_model_import or "response_model=object" in path.read_text(encoding="utf-8"):
        path.write_text(source, encoding="utf-8")
    return len(insertions)


def main() -> None:
    total = 0
    for path in sorted(ROUTERS.glob("*.py")):
        count = migrate(path)
        if count:
            print(f"route_response_models_added={count} file={path.name}")
            total += count
    print(f"route_response_models_total={total}")


if __name__ == "__main__":
    main()
