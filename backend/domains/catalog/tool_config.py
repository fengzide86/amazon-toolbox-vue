"""Tool-catalog normalization rules independent from HTTP routing."""
from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

DEFAULT_CATEGORIES = [
    {"id": "all", "name": "全部工具", "sort_order": 0},
    {"id": "data", "name": "数据分析", "sort_order": 1},
    {"id": "operation", "name": "运营工具", "sort_order": 2},
    {"id": "automation", "name": "自动化工具", "sort_order": 3},
    {"id": "other", "name": "其他工具", "sort_order": 4},
]
DEFAULT_TARGET_URLS = {
    "amazon": "https://sellercentral.amazon.com/",
    "aliexpress": "https://sellercenter.aliexpress.com/",
}
VALID_RELEASE_STATUSES = {"available", "beta", "maintenance", "disabled"}
VALID_TOOL_STATUSES = {"online", "maintenance", "offline"}
SENSITIVE_BATCH_KEYS = {"password", "passwd", "pwd", "secret", "token", "cookie"}


def _items(value: object) -> Iterable[object]:
    return value if isinstance(value, list) else []


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9_]+", "_", (value or "").strip().lower())
    return re.sub(r"_+", "_", value).strip("_") or "tool"


def plan_code(plan_name: str) -> str | None:
    match = re.search(r"Y\d+", plan_name or "", re.IGNORECASE)
    return match.group(0).upper() if match else None


def resolve_tool_runtime(tool: dict[str, Any], platform_key: str) -> tuple[str, str]:
    capability_key = tool.get("capability_key") or tool.get("id") or "unknown"
    script_key = tool.get("script_key") or f"{platform_key}.{capability_key}.v1"
    target_url = tool.get("target_url") or DEFAULT_TARGET_URLS.get(platform_key, "")
    return str(script_key), str(target_url)


def normalize_tool_config(tool: dict[str, Any], index: int = 0) -> dict[str, Any]:
    normalized = dict(tool or {})
    platform_key = str(normalized.get("platform_key") or "amazon").strip()
    capability_key = slugify(str(
        normalized.get("capability_key") or normalized.get("id") or normalized.get("module")
        or normalized.get("name") or f"tool_{index + 1}"
    ))
    tool_id = slugify(str(normalized.get("id") or f"tool_{capability_key}"))
    release_status = str(normalized.get("release_status") or "available")
    if release_status not in VALID_RELEASE_STATUSES:
        release_status = "maintenance"
    status = str(normalized.get("status") or ("online" if release_status in {"available", "beta"} else "maintenance"))
    if status not in VALID_TOOL_STATUSES:
        status = "online" if release_status in {"available", "beta"} else "maintenance"
    script_key, target_url = resolve_tool_runtime(
        {**normalized, "id": tool_id, "platform_key": platform_key, "capability_key": capability_key}, platform_key
    )
    normalized.update({
        "id": tool_id,
        "name": str(normalized.get("name") or "未命名工具").strip(),
        "module": str(normalized.get("module") or "未分类").strip(),
        "category": normalized.get("category") or "automation",
        "platform_key": platform_key,
        "capability_key": capability_key,
        "release_status": release_status,
        "status": status,
        "description": normalized.get("description") or "",
        "script_key": normalized.get("script_key") or script_key,
        "target_url": normalized.get("target_url") or target_url,
        "tool_version": str(normalized.get("tool_version") or "1.0.0"),
        "runner_api_version": int(normalized.get("runner_api_version") or 1),
        "sort_order": int(normalized.get("sort_order") or index + 1),
        "available_plans": normalized.get("available_plans") or [],
        "capability_tags": [str(item).strip() for item in _items(normalized.get("capability_tags")) if str(item).strip()][:3],
        "preparation_notes": [str(item).strip() for item in _items(normalized.get("preparation_notes")) if str(item).strip()],
        "intervention_scenarios": [str(item).strip() for item in _items(normalized.get("intervention_scenarios")) if str(item).strip()],
        "supports_batch": bool(normalized.get("supports_batch", False)),
        "business_description": str(normalized.get("business_description") or "").strip(),
    })
    batch_schema: list[dict[str, object]] = []
    for field in _items(normalized.get("batch_input_schema")):
        if not isinstance(field, dict):
            continue
        key = slugify(str(field.get("key") or ""))
        if key in SENSITIVE_BATCH_KEYS:
            continue
        batch_schema.append({
            "key": key,
            "label": str(field.get("label") or key).strip()[:80],
            "type": "text",
            "required": bool(field.get("required")),
            "sensitive": bool(field.get("sensitive")),
        })
    if normalized["supports_batch"] and not any(item["key"] == "account_label" for item in batch_schema):
        batch_schema.insert(0, {"key": "account_label", "label": "客户简称", "type": "text", "required": True, "sensitive": False})
    normalized["batch_input_schema"] = batch_schema
    normalized["requires_signature"] = bool(normalized.get("requires_signature", True))
    if isinstance(normalized["available_plans"], str):
        normalized["available_plans"] = [item.strip() for item in normalized["available_plans"].split(",") if item.strip()]
    return normalized


def normalize_tool_configs(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [normalize_tool_config(tool, index) for index, tool in enumerate(tools or [])]
