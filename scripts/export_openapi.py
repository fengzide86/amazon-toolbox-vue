"""Export the FastAPI OpenAPI document deterministically.

The exporter never starts the application lifespan or connects to production
dependencies. It only imports the application in an isolated SQLite test
configuration and serializes ``app.openapi()``.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def configure_environment() -> None:
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("DEBUG", "true")
    os.environ.setdefault("DB_TYPE", "sqlite")
    os.environ.setdefault("DB_PATH", str(BACKEND / ".openapi-schema.db"))
    os.environ.setdefault("TOOLBOX_RUNTIME_DIR", str(BACKEND / ".openapi-runtime"))
    os.environ.setdefault("JWT_SECRET_KEY", "openapi-export-only-key-not-used-at-runtime")
    sys.path.insert(0, str(BACKEND))


def rendered_schema() -> str:
    configure_environment()
    from main import app

    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export or verify the backend OpenAPI document")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = args.output if args.output.is_absolute() else ROOT / args.output
    rendered = rendered_schema()
    if args.check:
        if not target.is_file():
            print(f"OpenAPI document is missing: {target}", file=sys.stderr)
            return 1
        if target.read_text(encoding="utf-8") != rendered:
            print(f"OpenAPI document is stale: {target}", file=sys.stderr)
            return 1
        print(f"openapi_document=up_to_date path={target.relative_to(ROOT)}")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print(f"openapi_document=written path={target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
