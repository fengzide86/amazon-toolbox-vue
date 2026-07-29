"""Compatibility exports for the access entitlement domain."""

from domains.access import (
    DEFAULT_ENTITLEMENTS,
    normalize_entitlements,
    require_business_access,
    resolve_product_access,
    serialize_entitlements,
)

__all__ = [
    "DEFAULT_ENTITLEMENTS",
    "normalize_entitlements",
    "require_business_access",
    "resolve_product_access",
    "serialize_entitlements",
]
