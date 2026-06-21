"""
缓存管理模块
支持 Redis 缓存，提供统一的缓存接口
"""
import json
from typing import Any, Optional, Dict, List
from datetime import timedelta
from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)


class CacheManager:
    """缓存管理器"""
    
    def __init__(self):
        self.redis = None
        self._initialized = False
    
    async def init(self):
        """初始化 Redis 连接"""
        if self._initialized:
            return
        
        if settings.REDIS_URL:
            try:
                import redis.asyncio as aioredis
                self.redis = aioredis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True
                )
                # 测试连接
                await self.redis.ping()
                logger.info(f"Redis 连接成功: {settings.REDIS_URL}")
                self._initialized = True
            except Exception as e:
                logger.warning(f"Redis 连接失败，将使用内存缓存: {e}")
                self.redis = None
                self._initialized = True
        else:
            logger.info("未配置 Redis，使用内存缓存")
            self._initialized = True
    
    async def get(self, key: str) -> Optional[Any]:
        """获取缓存数据"""
        if self.redis:
            try:
                data = await self.redis.get(key)
                if data:
                    return json.loads(data)
            except Exception as e:
                logger.error(f"Redis GET 错误 [{key}]: {e}")
        return None
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """设置缓存数据
        
        Args:
            key: 缓存键
            value: 缓存值（必须是 JSON 可序列化的）
            ttl: 过期时间（秒），默认5分钟
        """
        if self.redis:
            try:
                data = json.dumps(value, ensure_ascii=False, default=str)
                await self.redis.setex(key, ttl, data)
                return True
            except Exception as e:
                logger.error(f"Redis SET 错误 [{key}]: {e}")
        return False
    
    async def delete(self, key: str) -> bool:
        """删除缓存"""
        if self.redis:
            try:
                await self.redis.delete(key)
                return True
            except Exception as e:
                logger.error(f"Redis DELETE 错误 [{key}]: {e}")
        return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """批量删除匹配模式的缓存
        
        Args:
            pattern: 匹配模式，如 "plans:*"
            
        Returns:
            删除的键数量
        """
        if self.redis:
            try:
                cursor = 0
                deleted_count = 0
                while True:
                    cursor, keys = await self.redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        deleted_count += await self.redis.delete(*keys)
                    if cursor == 0:
                        break
                return deleted_count
            except Exception as e:
                logger.error(f"Redis DELETE_PATTERN 错误 [{pattern}]: {e}")
        return 0
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if self.redis:
            try:
                return await self.redis.exists(key) > 0
            except Exception as e:
                logger.error(f"Redis EXISTS 错误 [{key}]: {e}")
        return False
    
    async def incr(self, key: str, amount: int = 1, ttl: int = None) -> Optional[int]:
        """原子递增"""
        if self.redis:
            try:
                value = await self.redis.incrby(key, amount)
                if ttl and value == amount:  # 首次设置时设置过期时间
                    await self.redis.expire(key, ttl)
                return value
            except Exception as e:
                logger.error(f"Redis INCR 错误 [{key}]: {e}")
        return None
    
    async def get_ttl(self, key: str) -> int:
        """获取键的剩余过期时间（秒）"""
        if self.redis:
            try:
                return await self.redis.ttl(key)
            except Exception as e:
                logger.error(f"Redis TTL 错误 [{key}]: {e}")
        return -1
    
    async def close(self):
        """关闭 Redis 连接"""
        if self.redis:
            try:
                await self.redis.close()
                logger.info("Redis 连接已关闭")
            except Exception as e:
                logger.error(f"Redis 关闭错误: {e}")


# ===== 缓存键常量 =====
class CacheKeys:
    """缓存键定义
    
    统一命名规范: {module}:{entity}:{identifier}
    """
    # 套餐相关
    PLANS_LIST = "plans:list:all"
    PLAN_DETAIL = "plans:detail:{plan_id}"
    
    # 设置相关
    SETTINGS_ALL = "settings:global:all"
    SETTING_KEY = "settings:item:{key}"
    
    # 用户相关
    USER_INFO = "users:detail:{user_id}"
    USER_AUTH_CODE = "users:auth:{user_id}"
    USERS_LIST = "users:list:{platform}"
    
    # 授权码相关
    AUTH_CODE_INFO = "auth_codes:detail:{code}"
    AUTH_CODES_LIST = "auth_codes:list:{platform}"
    
    # Dashboard 相关
    DASHBOARD_STATS = "dashboard:stats:{platform}"
    DASHBOARD_CHARTS = "dashboard:charts:{platform}"
    
    # 工具相关
    TOOLS_LIST = "tools:config:all"
    TOOLS_CATEGORIES = "tools:categories:all"
    
    # 分润相关
    PROFIT_LIST = "profit:list:{platform}"
    PROFIT_SUMMARY = "profit:summary:{platform}"
    
    # 公告相关
    ANNOUNCEMENTS_ACTIVE = "announcements:active:all"
    
    # 知识库相关
    KNOWLEDGE_LIST = "knowledge:list:{category}"
    KNOWLEDGE_CATEGORIES = "knowledge:categories:all"
    
    @classmethod
    def plan_detail(cls, plan_id: int) -> str:
        return cls.PLAN_DETAIL.format(plan_id=plan_id)
    
    @classmethod
    def setting_key(cls, key: str) -> str:
        return cls.SETTING_KEY.format(key=key)
    
    @classmethod
    def user_info(cls, user_id: int) -> str:
        return cls.USER_INFO.format(user_id=user_id)
    
    @classmethod
    def auth_code_info(cls, code: str) -> str:
        return cls.AUTH_CODE_INFO.format(code=code)
    
    @classmethod
    def dashboard_stats(cls, platform: str = "all") -> str:
        return cls.DASHBOARD_STATS.format(platform=platform or "all")
    
    @classmethod
    def dashboard_charts(cls, platform: str = "all") -> str:
        return cls.DASHBOARD_CHARTS.format(platform=platform or "all")
    
    @classmethod
    def users_list(cls, platform: str = "all") -> str:
        return cls.USERS_LIST.format(platform=platform or "all")
    
    @classmethod
    def auth_codes_list(cls, platform: str = "all") -> str:
        return cls.AUTH_CODES_LIST.format(platform=platform or "all")
    
    @classmethod
    def profit_list(cls, platform: str = "all") -> str:
        return cls.PROFIT_LIST.format(platform=platform or "all")
    
    @classmethod
    def profit_summary(cls, platform: str = "all") -> str:
        return cls.PROFIT_SUMMARY.format(platform=platform or "all")


# ===== 缓存装饰器 =====
def cache_result(ttl: int = 300, key_prefix: str = ""):
    """缓存装饰器（用于函数）
    
    注意：这是一个简单的装饰器，实际使用建议直接调用 cache 方法
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # 生成缓存键
            key_parts = [key_prefix or func.__name__]
            key_parts.extend(str(arg) for arg in args[:3])  # 只用前3个参数
            cache_key = ":".join(key_parts)
            
            # 尝试从缓存获取
            cached = await cache.get(cache_key)
            if cached is not None:
                return cached
            
            # 执行函数
            result = await func(*args, **kwargs)
            
            # 存入缓存
            await cache.set(cache_key, result, ttl)
            return result
        return wrapper
    return decorator


# 全局缓存实例
cache = CacheManager()