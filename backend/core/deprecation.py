"""Compatibility endpoint observability without recording credentials or payloads."""
from __future__ import annotations

from fastapi import Request

from core.logging import get_logger

logger = get_logger(__name__)


def log_deprecated_api_call(request: Request, endpoint: str, removal_version: str = "1.9.0") -> None:
    """Record only routing and client-version metadata for a deprecated endpoint."""
    logger.warning(
        "deprecated_api_call",
        extra={
            "extra_data": {
                "endpoint": endpoint,
                "client_version": request.headers.get("x-toolbox-version", "unknown")[:32],
                "removal_version": removal_version,
            }
        },
    )
