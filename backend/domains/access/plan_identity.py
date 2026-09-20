"""Stable tool-entitlement identity stored in the existing plan JSON.

Only legacy rows (and legacy create requests) may derive their initial identity
from the old display-name convention. A present null is an explicit, frozen
identity with no restricted-tool entitlement; it must never fall back to name.
"""

from __future__ import annotations

import json
import re
from typing import Any


def plan_entitlements_source(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            value = {}
    return dict(value) if isinstance(value, dict) else {}


def resolve_plan_code(plan_name: str | None, entitlements: Any) -> str | None:
    source = plan_entitlements_source(entitlements)
    if "plan_code" in source:
        code = source["plan_code"]
        # Corrupt/unknown stored identities fail closed, not back to the name.
        return code if isinstance(code, str) and re.fullmatch(r"Y\d+", code) else None
    # Compatibility boundary for pre-identity rows and old admin create clients.
    match = re.search(r"Y\d+", plan_name or "", re.IGNORECASE)
    return match.group(0).upper() if match else None


def fixed_plan_entitlements(plan_name: str | None, entitlements: Any) -> dict[str, Any]:
    """Preserve unrelated rights and freeze the legacy identity, including null."""
    source = plan_entitlements_source(entitlements)
    return {**source, "plan_code": resolve_plan_code(plan_name, source)}
