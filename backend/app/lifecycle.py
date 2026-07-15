from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.cache import cache
from core.config import settings
from core.logging import get_logger, setup_logging
from core.tasks import task_manager
from core.token_blacklist import logout_manager, token_blacklist
from database import engine, init_db
from services.seed_service import seed_initial_data

setup_logging(level=os.getenv("LOG_LEVEL", "INFO"), json_format=os.getenv("LOG_FORMAT", "") == "json")
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("正在初始化后端服务")
    await init_db()
    await seed_initial_data()
    await cache.init()
    await token_blacklist.init(cache.redis)
    await logout_manager.init(cache.redis)

    security_result = settings.check_security()
    for warning in security_result["warnings"]:
        logger.warning("安全提示: %s", warning)
    if security_result["errors"]:
        for error in security_result["errors"]:
            logger.error("安全错误: %s", error)
        if not settings.DEBUG:
            raise RuntimeError("生产环境安全检查未通过")

    logger.info("%s v%s 启动完成", settings.APP_NAME, settings.APP_VERSION)
    yield

    logger.info("应用正在关闭")
    await task_manager.shutdown(timeout=5.0)
    await cache.close()
    await engine.dispose()
