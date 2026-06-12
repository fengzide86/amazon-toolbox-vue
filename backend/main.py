"""
亚马逊赛训效率工具箱 - 后端服务入口（优化版）

重构后的 main.py 使用模块化架构:
- core/: 核心配置和工具
- routers/: API 路由模块
- services/: 业务逻辑模块

优化内容:
- GZip 响应压缩
- 请求 ID 追踪
- 增强的健康检查
- Redis 缓存集成
- Token 黑名单集成
- 结构化日志
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import os
import uuid

# 导入核心模块
from core.config import settings
from core.security import configure_cors
from core.exceptions import register_exception_handlers
from core.logging import setup_logging, get_logger, set_request_id, set_user_id
from core.cache import cache
from core.token_blacklist import token_blacklist, logout_manager
from core.tasks import task_manager

# 导入数据库模块
from database import init_db, engine, check_db_health, get_db_stats

# 导入路由模块
from routers import (
    auth,
    dashboard,
    plans,
    auth_codes,
    orders,
    users,
    logs,
    feedback,
    profit,
    settings as settings_router,
    tools,
    updates,
    devices,
)

# 导入服务模块
from services.seed_service import seed_initial_data

# 配置日志（增强版）
setup_logging(
    level=os.getenv("LOG_LEVEL", "INFO"),
    json_format=os.getenv("LOG_FORMAT", "") == "json"
)
logger = get_logger(__name__)


# ===== API 频率限制 =====
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# 创建限流器
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
    storage_uri="memory://",  # 使用内存存储（生产环境可用 Redis）
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # ===== 启动时初始化 =====
    logger.info("=" * 60)
    logger.info("正在初始化后端服务...")
    
    # 1. 初始化数据库
    logger.info("正在初始化数据库...")
    await init_db()
    
    # 2. 初始化种子数据
    logger.info("正在初始化种子数据...")
    await seed_initial_data()
    
    # 3. 初始化 Redis 缓存
    logger.info("正在初始化缓存...")
    await cache.init()
    
    # 4. 初始化 Token 黑名单
    logger.info("正在初始化 Token 黑名单...")
    await token_blacklist.init(cache.redis)
    await logout_manager.init(cache.redis)
    
    logger.info(f"数据库类型: {settings.DB_TYPE}")
    logger.info(f"Redis: {'已配置' if cache.redis else '未配置（使用内存缓存）'}")
    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} 启动完成")
    logger.info("=" * 60)
    
    yield
    
    # ===== 关闭时清理 =====
    logger.info("应用正在关闭...")
    
    # 1. 关闭任务管理器
    await task_manager.shutdown(timeout=5.0)
    
    # 2. 关闭 Redis 连接
    await cache.close()
    
    # 3. 关闭数据库连接
    await engine.dispose()
    
    logger.info("应用已完全关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,  # 生产环境禁用 Swagger
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# ===== 中间件配置 =====

# 1. GZip 压缩（压缩超过 1KB 的响应）
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 2. CORS 配置
configure_cors(app)

# 3. API 频率限制
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 4. 全局异常处理器
register_exception_handlers(app)


# ===== 自定义中间件：请求追踪和日志 =====

@app.middleware("http")
async def request_tracking_middleware(request: Request, call_next):
    """请求追踪中间件
    
    - 生成请求 ID
    - 记录请求日志
    - 添加响应头
    """
    import time
    
    # 生成请求 ID
    request_id = str(uuid.uuid4())[:8]
    set_request_id(request_id)
    
    # 记录开始时间
    start_time = time.time()
    
    # 获取客户端 IP
    client_ip = request.client.host if request.client else "unknown"
    
    # 执行请求
    try:
        response = await call_next(request)
    except Exception as e:
        # 记录异常
        process_time = time.time() - start_time
        logger.error(
            f"[{request_id}] {request.method} {request.url.path} - "
            f"异常: {e} - 耗时: {process_time:.3f}s"
        )
        raise
    
    # 计算耗时
    process_time = time.time() - start_time
    
    # 记录请求日志
    logger.info(
        f"[{request_id}] {request.method} {request.url.path} - "
        f"状态: {response.status_code} - "
        f"耗时: {process_time:.3f}s - "
        f"IP: {client_ip}"
    )
    
    # 添加响应头
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{process_time:.3f}"
    
    # 清除请求上下文
    set_request_id("")
    set_user_id(None)
    
    return response


# ===== 注册路由模块 =====
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["数据看板"])
app.include_router(plans.router, prefix="/api/plans", tags=["套餐管理"])
app.include_router(auth_codes.router, prefix="/api/auth-codes", tags=["授权码管理"])
app.include_router(orders.router, prefix="/api/orders", tags=["订单管理"])
app.include_router(users.router, prefix="/api/users", tags=["用户管理"])
app.include_router(logs.router, prefix="/api/logs", tags=["运行日志"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["工单反馈"])
app.include_router(profit.router, prefix="/api/profit", tags=["分润管理"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["系统设置"])
app.include_router(tools.router, prefix="/api/tools", tags=["工具配置"])
app.include_router(updates.router, prefix="/api/updates", tags=["自动更新"])
app.include_router(devices.router, prefix="/api/devices", tags=["设备管理"])


# ===== 增强的健康检查接口 =====

@app.get("/api/health")
@limiter.limit("30/minute")
async def health_check(request: Request):
    """增强的健康检查接口
    
    检查项:
    - 应用状态
    - 数据库连接
    - Redis 连接（如果配置）
    - 连接池状态
    """
    health_status = {
        "status": "ok",
        "version": settings.APP_VERSION,
        "checks": {},
    }
    
    # 1. 数据库检查
    db_health = await check_db_health()
    health_status["checks"]["database"] = db_health
    
    if db_health["status"] != "ok":
        health_status["status"] = "degraded"
    
    # 2. Redis 检查（如果配置）
    if cache.redis:
        try:
            await cache.redis.ping()
            health_status["checks"]["redis"] = {"status": "ok"}
        except Exception as e:
            health_status["checks"]["redis"] = {"status": "error", "error": str(e)}
            health_status["status"] = "degraded"
    else:
        health_status["checks"]["redis"] = {"status": "not_configured"}
    
    # 3. 连接池状态
    db_stats = await get_db_stats()
    health_status["checks"]["pool"] = db_stats.get("pool", {})
    
    # 4. 后台任务数
    health_status["checks"]["tasks"] = {
        "pending": task_manager.pending_count
    }
    
    return health_status


# ===== 系统信息接口 =====

@app.get("/api/system-info")
@limiter.limit("10/minute")
async def system_info(request: Request):
    """系统信息接口（管理员用）"""
    import platform
    
    return {
        "app": {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
        },
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "database": {
            "type": settings.DB_TYPE,
        },
        "cache": {
            "enabled": cache.redis is not None,
            "type": "redis" if cache.redis else "memory",
        },
        "features": {
            "rate_limit": True,
            "gzip": True,
            "request_tracking": True,
            "token_blacklist": True,
        }
    }


# ===== 挂载静态文件服务 =====
from fastapi.staticfiles import StaticFiles
UPDATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "updates")
os.makedirs(UPDATES_DIR, exist_ok=True)
app.mount("/updates", StaticFiles(directory=UPDATES_DIR), name="updates")


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"后端服务启动在端口: {settings.PORT}")
    logger.info(f"数据库类型: {settings.DB_TYPE}")
    logger.info(f"调试模式: {settings.DEBUG}")
    
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level="warning",  # 生产环境用 warning，减少日志 IO
        access_log=False,  # 使用自定义日志
    )
