"""Generate deterministic TypeScript contracts from the checked-in OpenAPI file."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
HTTP_METHODS = ("get", "post", "put", "patch", "delete", "options", "head")


def quoted(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def reference_type(reference: str) -> str:
    name = reference.rsplit("/", 1)[-1]
    return f"components['schemas'][{quoted(name)}]"


def schema_type(schema: Any) -> str:
    if not isinstance(schema, dict) or not schema:
        return "unknown"
    if "$ref" in schema:
        return reference_type(str(schema["$ref"]))
    if "const" in schema:
        return json.dumps(schema["const"], ensure_ascii=False)
    if isinstance(schema.get("enum"), list):
        values = schema["enum"]
        return " | ".join(json.dumps(value, ensure_ascii=False) for value in values) or "never"
    for composition in ("oneOf", "anyOf"):
        if isinstance(schema.get(composition), list):
            members = [schema_type(item) for item in schema[composition]]
            return " | ".join(dict.fromkeys(members))
    if isinstance(schema.get("allOf"), list):
        return " & ".join(schema_type(item) for item in schema["allOf"])
    schema_type_name = schema.get("type")
    if isinstance(schema_type_name, list):
        return " | ".join(schema_type({"type": item}) for item in schema_type_name)
    if schema_type_name == "array":
        return f"Array<{schema_type(schema.get('items'))}>"
    if schema_type_name == "object" or "properties" in schema:
        properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        required = set(schema.get("required") or [])
        fields = [
            f"{quoted(str(name))}{'' if name in required else '?'}: {schema_type(value)}"
            for name, value in properties.items()
        ]
        additional = schema.get("additionalProperties")
        if additional is True:
            fields.append("[key: string]: unknown")
        elif isinstance(additional, dict):
            fields.append(f"[key: string]: {schema_type(additional)}")
        return "{ " + "; ".join(fields) + " }"
    return {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "null": "null",
    }.get(str(schema_type_name), "unknown")


def media_schema(container: Any) -> str:
    if not isinstance(container, dict):
        return "unknown"
    content = container.get("content")
    if not isinstance(content, dict) or not content:
        return "unknown"
    preferred = content.get("application/json") or content.get("application/octet-stream")
    if isinstance(preferred, dict):
        return schema_type(preferred.get("schema"))
    first = next(iter(content.values()), {})
    return schema_type(first.get("schema")) if isinstance(first, dict) else "unknown"


def parameters_type(operation: dict[str, Any]) -> str:
    grouped: dict[str, list[str]] = {}
    for parameter in operation.get("parameters", []):
        if not isinstance(parameter, dict):
            continue
        location = str(parameter.get("in") or "query")
        name = str(parameter.get("name") or "parameter")
        optional = "" if parameter.get("required") else "?"
        grouped.setdefault(location, []).append(
            f"{quoted(name)}{optional}: {schema_type(parameter.get('schema'))}"
        )
    if not grouped:
        return "never"
    return "{ " + "; ".join(
        f"{quoted(location)}: {{ {'; '.join(fields)} }}" for location, fields in grouped.items()
    ) + " }"


def response_type(operation: dict[str, Any]) -> str:
    responses = operation.get("responses")
    if not isinstance(responses, dict):
        return "unknown"
    members: list[str] = []
    for status, response in responses.items():
        body = media_schema(response)
        members.append(f"{quoted(str(status))}: {body}")
    return "{ " + "; ".join(members) + " }"


def safe_operation_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", value)


def generate(schema: dict[str, Any]) -> str:
    schemas = schema.get("components", {}).get("schemas", {})
    schema_lines = [
        f"    {quoted(str(name))}: {schema_type(value)}"
        for name, value in sorted(schemas.items())
    ]
    operation_lines: list[str] = []
    path_lines: list[str] = []
    for route, path_item in sorted(schema.get("paths", {}).items()):
        if not isinstance(path_item, dict):
            continue
        method_lines: list[str] = []
        for method in HTTP_METHODS:
            operation = path_item.get(method)
            if not isinstance(operation, dict):
                continue
            operation_id = safe_operation_id(str(operation.get("operationId") or f"{method}_{route}"))
            request_body = media_schema(operation.get("requestBody")) if operation.get("requestBody") else "never"
            operation_lines.extend(
                [
                    f"  {quoted(operation_id)}: {{",
                    f"    parameters: {parameters_type(operation)}",
                    f"    requestBody: {request_body}",
                    f"    responses: {response_type(operation)}",
                    "  }",
                ]
            )
            method_lines.append(f"    {method}: operations[{quoted(operation_id)}]")
        path_lines.extend([f"  {quoted(route)}: {{", *method_lines, "  }"])
    return "\n".join(
        [
            "/* eslint-disable */",
            "/** Generated by scripts/generate_openapi_types.py. Do not edit manually. */",
            "export interface components {",
            "  schemas: {",
            *schema_lines,
            "  }",
            "}",
            "",
            "export interface operations {",
            *operation_lines,
            "}",
            "",
            "export interface paths {",
            *path_lines,
            "}",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("backend/openapi.json"))
    parser.add_argument("--output", type=Path, default=Path("src/shared/api/openapi.generated.ts"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    source = args.input if args.input.is_absolute() else ROOT / args.input
    target = args.output if args.output.is_absolute() else ROOT / args.output
    rendered = generate(json.loads(source.read_text(encoding="utf-8")))
    if args.check:
        if not target.is_file() or target.read_text(encoding="utf-8") != rendered:
            print(f"generated OpenAPI types are stale: {target}", file=sys.stderr)
            return 1
        print(f"openapi_types=up_to_date path={target.relative_to(ROOT)}")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print(f"openapi_types=written path={target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
