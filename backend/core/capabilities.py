"""Single source of truth for staff capabilities.

The API still exposes the historical role names.  This module deliberately
keeps role-to-capability resolution small and data-only so routers can migrate
incrementally without changing their public URLs or response contracts.
"""

from __future__ import annotations

from collections.abc import Collection

from models import StaffRole

CAPABILITIES = frozenset(
    {
        "backoffice.read",
        "auth_codes.write",
        "auth_codes.delete",
        "business_access.write",
        "orders.write",
        "plans.read",
        "devices.unbind",
        "profit.read",
        "profit.policy.write",
        "expenses.read",
        "expenses.write",
        "expenses.categories.manage",
        "users.write",
        "feedback.write",
        "knowledge.write",
        "rules.write",
        "announcements.write",
        "staff.manage",
        "updates.manage",
        "settings.manage",
        "agency.manage",
        "agency.workspace.read",
        "agency.commission.read",
    }
)


ROLE_CAPABILITIES: dict[str, frozenset[str]] = {
    StaffRole.SUPER_ADMIN: CAPABILITIES,
    StaffRole.OPERATOR: frozenset(
        {
            "backoffice.read",
            "auth_codes.write",
            "auth_codes.delete",
            "business_access.write",
            "orders.write",
            "plans.read",
            "devices.unbind",
            "profit.read",
            "expenses.read",
            "expenses.write",
            "users.write",
            "feedback.write",
            "knowledge.write",
            "rules.write",
        }
    ),
    StaffRole.SUPPORT: frozenset(
        {
            "backoffice.read",
            "plans.read",
            "devices.unbind",
            "feedback.write",
            "knowledge.write",
            "rules.write",
            "announcements.write",
        }
    ),
    # Agent capabilities are intentionally read-only and scoped by agency_id
    # in require_agency_staff; they never inherit internal admin permissions.
    StaffRole.AGENT: frozenset({"agency.workspace.read", "agency.commission.read"}),
}


def capabilities_for_role(role: str | None) -> frozenset[str]:
    """Return an immutable set; unknown roles have no capabilities."""

    return ROLE_CAPABILITIES.get(role or "", frozenset())


def has_capability(role: str | None, capability: str) -> bool:
    return capability in capabilities_for_role(role)


def roles_with(capability: str, roles: Collection[str] | None = None) -> frozenset[str]:
    """Resolve role names for compatibility dependencies and route migrations."""

    candidates = roles or ROLE_CAPABILITIES.keys()
    return frozenset(role for role in candidates if has_capability(role, capability))


__all__ = ["CAPABILITIES", "ROLE_CAPABILITIES", "capabilities_for_role", "has_capability", "roles_with"]
