"""Thin backend entrypoint; application assembly lives in app.factory."""
from __future__ import annotations

import uvicorn

from app.factory import create_app
from core.config import settings
from core.logging import get_logger

app = create_app()
logger = get_logger(__name__)


if __name__ == "__main__":
    logger.info("后端服务启动在端口: %s", settings.PORT)
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level="warning",
        access_log=False,
    )
