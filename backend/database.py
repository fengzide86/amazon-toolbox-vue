"""
数据库连接配置（优化版）
支持 SQLite（本地开发）和 MySQL（生产环境）
包含连接池优化、健康检查、慢查询日志等功能
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text, event
from core.config import settings
from core.logging import get_logger
import time

logger = get_logger(__name__)

# 从配置获取数据库 URL
DATABASE_URL = settings.get_database_url()

logger.info(f"数据库类型: {settings.DB_TYPE}")
logger.info(f"数据库连接: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")

# 创建异步引擎
engine_kwargs = {
    "echo": False,
}

if settings.DB_TYPE == "mysql":
    engine_kwargs.update({
        # ===== 连接池配置（针对1核2G服务器优化）=====
        "pool_size": 10,              # 连接池大小（降低内存占用）
        "max_overflow": 20,           # 最大溢出连接数（pool_size + max_overflow = 最大30连接）
        "pool_recycle": 1800,         # 30分钟回收连接（防止 MySQL 8小时超时）
        "pool_pre_ping": False,       # 关闭（aiomysql 兼容性问题，用 pool_recycle 代替）
        "pool_timeout": 10,           # 获取连接超时时间（秒）- 缩短超时快速失败
        
        # ===== MySQL 连接参数 =====
        "connect_args": {
            "connect_timeout": 10,    # 连接超时
            "charset": "utf8mb4",
        },
    })
elif settings.DB_TYPE == "sqlite":
    engine_kwargs.update({
        "connect_args": {
            "timeout": 30,  # SQLite 锁等待超时
        },
    })

engine = create_async_engine(DATABASE_URL, **engine_kwargs)

# 会话工厂
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,  # 手动控制 flush
)

Base = declarative_base()


# ===== 慢查询阈值（秒）=====
SLOW_QUERY_THRESHOLD = 1.0  # 1秒


async def get_db():
    """获取数据库会话（依赖注入用）
    
    包含慢查询日志记录
    """
    async with async_session_maker() as session:
        try:
            start_time = time.time()
            yield session
            elapsed = time.time() - start_time
            
            # 记录慢查询
            if elapsed > SLOW_QUERY_THRESHOLD:
                logger.warning(f"慢查询检测: 会话耗时 {elapsed:.2f}s")
        except Exception as e:
            await session.rollback()
            logger.error(f"数据库会话异常: {e}", exc_info=True)
            raise
        finally:
            await session.close()


async def init_db():
    """初始化数据库（创建所有表）"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("数据库表初始化完成")
    
    # 执行数据库迁移（添加缺失的列）
    await run_migrations()


async def run_migrations():
    """执行数据库迁移 - 自动添加缺失的列
    
    用于兼容旧版本数据库，自动添加新增的字段
    """
    if settings.DB_TYPE == "sqlite":
        await _migrate_sqlite()
    else:
        await _migrate_mysql()
    logger.info("数据库迁移检查完成")


async def _migrate_sqlite():
    """SQLite 数据库迁移"""
    import sqlite3
    import os
    
    # 获取 SQLite 数据库路径
    db_path = settings.DB_PATH
    
    if not os.path.exists(db_path):
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 定义需要添加的列: (表名, 列名, 列定义)
    # 注意: SQLite 添加列时不支持 DEFAULT CURRENT_TIMESTAMP，使用 NULL 代替
    migrations = [
        # plans 表
        ("plans", "code_prefix", "VARCHAR(20)"),
        ("plans", "sort_order", "INTEGER DEFAULT 0"),
        ("plans", "updated_at", "DATETIME"),
        # orders 表
        ("orders", "updated_at", "DATETIME"),
        ("orders", "platform_key", "VARCHAR(50)"),
        # users 表
        ("users", "updated_at", "DATETIME"),
        ("users", "is_active", "BOOLEAN DEFAULT 1"),
        ("users", "last_active_at", "DATETIME"),
        ("users", "extra_devices", "INTEGER DEFAULT 0"),
        # auth_codes 表
        ("auth_codes", "max_devices", "INTEGER DEFAULT 1"),
        # feedback 表
        ("feedback", "priority", "VARCHAR(10) DEFAULT 'normal'"),
        ("feedback", "status_history", "TEXT"),
        ("feedback", "admin_reply", "TEXT"),
        ("feedback", "replied_at", "DATETIME"),
        ("feedback", "screenshots", "TEXT"),
        ("feedback", "updated_at", "DATETIME"),
        # ===== 1.5 新增字段 =====
        # auth_codes 表 - 平台权限、场景、席位
        ("auth_codes", "platform_scope", "TEXT"),
        ("auth_codes", "scene_type", "VARCHAR(50)"),
        ("auth_codes", "seat_limit", "INTEGER DEFAULT 1"),
        # run_logs 表 - 平台化字段
        ("run_logs", "auth_code_id", "INTEGER"),
        ("run_logs", "platform_key", "VARCHAR(50)"),
        ("run_logs", "capability_key", "VARCHAR(100)"),
        ("run_logs", "script_key", "VARCHAR(100)"),
        ("run_logs", "tool_id", "VARCHAR(100)"),
        # feedback 表 - 平台化字段
        ("feedback", "platform_key", "VARCHAR(50)"),
        ("feedback", "capability_key", "VARCHAR(100)"),
        ("feedback", "tool_id", "VARCHAR(100)"),
        ("feedback", "run_log_id", "INTEGER"),
        # knowledge_base 表 - 平台化字段
        ("knowledge_base", "platform_key", "VARCHAR(50)"),
        ("knowledge_base", "capability_key", "VARCHAR(100)"),
        # chat_sessions 表 - 平台化字段
        ("chat_sessions", "platform_key", "VARCHAR(50)"),
        ("chat_sessions", "capability_key", "VARCHAR(100)"),
    ]
    
    for table, column, definition in migrations:
        try:
            # 检查列是否已存在
            cursor.execute(f"PRAGMA table_info({table})")
            existing_columns = [row[1] for row in cursor.fetchall()]
            
            if column not in existing_columns:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                logger.info(f"迁移: 添加 {table}.{column}")
        except Exception as e:
            logger.warning(f"迁移 {table}.{column} 失败: {e}")
    
    conn.commit()
    conn.close()


async def _migrate_mysql():
    """MySQL 数据库迁移"""
    # 定义需要添加的列: (表名, 列名, 列定义)
    migrations = [
        # plans 表
        ("plans", "code_prefix", "VARCHAR(20)"),
        ("plans", "sort_order", "INT DEFAULT 0"),
        ("plans", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        # orders 表
        ("orders", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ("orders", "platform_key", "VARCHAR(50)"),
        # users 表
        ("users", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ("users", "is_active", "BOOLEAN DEFAULT TRUE"),
        ("users", "last_active_at", "DATETIME"),
        ("users", "extra_devices", "INT DEFAULT 0"),
        # auth_codes 表
        ("auth_codes", "max_devices", "INT DEFAULT 1"),
        # feedback 表
        ("feedback", "priority", "VARCHAR(10) DEFAULT 'normal'"),
        ("feedback", "status_history", "TEXT"),
        ("feedback", "admin_reply", "TEXT"),
        ("feedback", "replied_at", "DATETIME"),
        ("feedback", "screenshots", "TEXT"),
        ("feedback", "updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        # ===== 1.5 新增字段 =====
        # auth_codes 表 - 平台权限、场景、席位
        ("auth_codes", "platform_scope", "TEXT"),
        ("auth_codes", "scene_type", "VARCHAR(50)"),
        ("auth_codes", "seat_limit", "INT DEFAULT 1"),
        # run_logs 表 - 平台化字段
        ("run_logs", "auth_code_id", "INT"),
        ("run_logs", "platform_key", "VARCHAR(50)"),
        ("run_logs", "capability_key", "VARCHAR(100)"),
        ("run_logs", "script_key", "VARCHAR(100)"),
        ("run_logs", "tool_id", "VARCHAR(100)"),
        # feedback 表 - 平台化字段
        ("feedback", "platform_key", "VARCHAR(50)"),
        ("feedback", "capability_key", "VARCHAR(100)"),
        ("feedback", "tool_id", "VARCHAR(100)"),
        ("feedback", "run_log_id", "INT"),
        # knowledge_base 表 - 平台化字段
        ("knowledge_base", "platform_key", "VARCHAR(50)"),
        ("knowledge_base", "capability_key", "VARCHAR(100)"),
        # chat_sessions 表 - 平台化字段
        ("chat_sessions", "platform_key", "VARCHAR(50)"),
        ("chat_sessions", "capability_key", "VARCHAR(100)"),
    ]
    
    async with async_session_maker() as session:
        for table, column, definition in migrations:
            try:
                # 检查列是否已存在
                result = await session.execute(text(
                    f"SELECT COUNT(*) FROM information_schema.COLUMNS "
                    f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'"
                ))
                exists = result.scalar() > 0
                
                if not exists:
                    await session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                    await session.commit()
                    logger.info(f"迁移: 添加 {table}.{column}")
            except Exception as e:
                logger.warning(f"迁移 {table}.{column} 失败: {e}")
                await session.rollback()


async def check_db_health() -> dict:
    """数据库健康检查
    
    Returns:
        健康状态字典
    """
    result = {
        "status": "ok",
        "type": settings.DB_TYPE,
        "latency_ms": None,
    }
    
    try:
        start = time.time()
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        latency = (time.time() - start) * 1000
        result["latency_ms"] = round(latency, 2)
        
        if latency > 1000:  # 超过1秒视为异常
            result["status"] = "slow"
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        logger.error(f"数据库健康检查失败: {e}")
    
    return result


async def get_db_stats() -> dict:
    """获取数据库统计信息
    
    Returns:
        连接池统计等
    """
    stats = {
        "type": settings.DB_TYPE,
        "pool": {},
    }
    
    if settings.DB_TYPE == "mysql":
        pool = engine.pool
        stats["pool"] = {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    
    return stats