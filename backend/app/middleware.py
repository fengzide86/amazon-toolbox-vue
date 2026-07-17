from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from core.logging import get_logger, set_request_id, set_user_id

logger = get_logger(__name__)
CallNext = Callable[[Request], Awaitable[Response]]


async def request_tracking_middleware(request: Request, call_next: CallNext) -> Response:
    request_id = str(uuid.uuid4())[:8]
    set_request_id(request_id)
    started_at = time.time()
    client_ip = request.client.host if request.client else "unknown"
    try:
        response = await call_next(request)
        elapsed = time.time() - started_at
        log_request = logger.warning if elapsed >= 1.0 else logger.info
        log_request(
            "[%s] %s %s - 状态: %s - 耗时: %.3fs - IP: %s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
            client_ip,
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{elapsed:.3f}"
        return response
    except Exception:
        logger.exception("[%s] %s %s 请求失败", request_id, request.method, request.url.path)
        raise
    finally:
        set_request_id("")
        set_user_id(None)
