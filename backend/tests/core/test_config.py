"""
配置模块测试
"""
import pytest
import os
from backend.core.config import settings


class TestConfig:
    """配置测试"""

    def test_settings_exists(self):
        """测试设置对象存在"""
        assert settings is not None

    def test_database_url(self):
        """测试数据库URL配置"""
        assert hasattr(settings, 'DATABASE_URL')
        assert settings.DATABASE_URL is not None
        assert isinstance(settings.DATABASE_URL, str)

    def test_secret_key(self):
        """测试密钥配置"""
        assert hasattr(settings, 'SECRET_KEY')
        assert settings.SECRET_KEY is not None
        assert isinstance(settings.SECRET_KEY, str)
        assert len(settings.SECRET_KEY) > 0

    def test_algorithm(self):
        """测试算法配置"""
        assert hasattr(settings, 'ALGORITHM')
        assert settings.ALGORITHM is not None
        assert settings.ALGORITHM == 'HS256'

    def test_access_token_expire_minutes(self):
        """测试访问令牌过期时间"""
        assert hasattr(settings, 'ACCESS_TOKEN_EXPIRE_MINUTES')
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES is not None
        assert isinstance(settings.ACCESS_TOKEN_EXPIRE_MINUTES, int)
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0

    def test_debug_mode(self):
        """测试调试模式配置"""
        assert hasattr(settings, 'DEBUG')
        assert isinstance(settings.DEBUG, bool)

    def test_cors_origins(self):
        """测试CORS来源配置"""
        assert hasattr(settings, 'CORS_ORIGINS')
        assert settings.CORS_ORIGINS is not None
        assert isinstance(settings.CORS_ORIGINS, list)
        assert len(settings.CORS_ORIGINS) > 0

    def test_api_prefix(self):
        """测试API前缀配置"""
        assert hasattr(settings, 'API_PREFIX')
        assert settings.API_PREFIX is not None
        assert isinstance(settings.API_PREFIX, str)
        assert settings.API_PREFIX.startswith('/')

    def test_log_level(self):
        """测试日志级别配置"""
        assert hasattr(settings, 'LOG_LEVEL')
        assert settings.LOG_LEVEL is not None
        assert settings.LOG_LEVEL in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

    def test_environment_variables(self):
        """测试环境变量加载"""
        # 测试可以从环境变量读取配置
        original_debug = os.environ.get('DEBUG')
        
        try:
            os.environ['DEBUG'] = 'True'
            # 重新加载配置
            from backend.core.config import Settings
            test_settings = Settings()
            assert test_settings.DEBUG is True
        finally:
            # 恢复原始环境变量
            if original_debug is not None:
                os.environ['DEBUG'] = original_debug
            elif 'DEBUG' in os.environ:
                del os.environ['DEBUG']

    def test_redis_url(self):
        """测试Redis URL配置"""
        assert hasattr(settings, 'REDIS_URL')
        assert settings.REDIS_URL is not None
        assert isinstance(settings.REDIS_URL, str)

    def test_cache_ttl(self):
        """测试缓存TTL配置"""
        assert hasattr(settings, 'CACHE_TTL')
        assert settings.CACHE_TTL is not None
        assert isinstance(settings.CACHE_TTL, int)
        assert settings.CACHE_TTL > 0

    def test_upload_directory(self):
        """测试上传目录配置"""
        assert hasattr(settings, 'UPLOAD_DIR')
        assert settings.UPLOAD_DIR is not None
        assert isinstance(settings.UPLOAD_DIR, str)

    def test_max_upload_size(self):
        """测试最大上传大小配置"""
        assert hasattr(settings, 'MAX_UPLOAD_SIZE')
        assert settings.MAX_UPLOAD_SIZE is not None
        assert isinstance(settings.MAX_UPLOAD_SIZE, int)
        assert settings.MAX_UPLOAD_SIZE > 0