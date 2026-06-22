"""
缓存模块测试
"""
import pytest
from datetime import timedelta
from core.cache import CacheManager


class TestCacheManager:
    """缓存管理器测试"""

    @pytest.fixture
    def cache(self):
        """创建缓存管理器实例"""
        return CacheManager()

    def test_set_and_get(self, cache):
        """测试设置和获取缓存"""
        cache.set("test_key", "test_value")
        value = cache.get("test_key")
        assert value == "test_value"

    def test_get_nonexistent_key(self, cache):
        """测试获取不存在的键"""
        value = cache.get("nonexistent_key")
        assert value is None

    def test_get_with_default(self, cache):
        """测试获取带默认值"""
        value = cache.get("nonexistent_key", default="default_value")
        assert value == "default_value"

    def test_delete(self, cache):
        """测试删除缓存"""
        cache.set("delete_key", "value")
        cache.delete("delete_key")
        value = cache.get("delete_key")
        assert value is None

    def test_clear(self, cache):
        """测试清空缓存"""
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None

    def test_set_with_ttl(self, cache):
        """测试设置带过期时间的缓存"""
        cache.set("ttl_key", "value", ttl=3600)
        value = cache.get("ttl_key")
        assert value == "value"

    def test_set_with_timedelta_ttl(self, cache):
        """测试设置带timedelta过期时间"""
        cache.set("delta_key", "value", ttl=timedelta(hours=1))
        value = cache.get("delta_key")
        assert value == "value"

    def test_exists(self, cache):
        """测试键是否存在"""
        cache.set("exists_key", "value")
        assert cache.exists("exists_key") is True
        assert cache.exists("nonexistent_key") is False

    def test_get_ttl(self, cache):
        """测试获取剩余过期时间"""
        cache.set("ttl_check_key", "value", ttl=3600)
        ttl = cache.get_ttl("ttl_check_key")
        assert ttl is not None
        assert 0 < ttl <= 3600

    def test_get_ttl_nonexistent_key(self, cache):
        """测试获取不存在键的过期时间"""
        ttl = cache.get_ttl("nonexistent_key")
        assert ttl is None

    def test_incr(self, cache):
        """测试递增操作"""
        cache.set("counter", 0)
        cache.incr("counter")
        assert cache.get("counter") == 1
        
        cache.incr("counter", 5)
        assert cache.get("counter") == 6

    def test_decr(self, cache):
        """测试递减操作"""
        cache.set("counter", 10)
        cache.decr("counter")
        assert cache.get("counter") == 9
        
        cache.decr("counter", 3)
        assert cache.get("counter") == 6

    def test_set_multiple_types(self, cache):
        """测试存储多种数据类型"""
        cache.set("string", "text")
        cache.set("int", 123)
        cache.set("float", 3.14)
        cache.set("bool", True)
        cache.set("list", [1, 2, 3])
        cache.set("dict", {"key": "value"})
        
        assert cache.get("string") == "text"
        assert cache.get("int") == 123
        assert cache.get("float") == 3.14
        assert cache.get("bool") is True
        assert cache.get("list") == [1, 2, 3]
        assert cache.get("dict") == {"key": "value"}

    def test_keys_pattern(self, cache):
        """测试按模式获取键"""
        cache.set("user:1", "user1")
        cache.set("user:2", "user2")
        cache.set("order:1", "order1")
        
        user_keys = cache.keys("user:*")
        assert len(user_keys) == 2
        assert "user:1" in user_keys
        assert "user:2" in user_keys

    def test_mget(self, cache):
        """测试批量获取"""
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")
        
        values = cache.mget(["key1", "key2", "key3", "nonexistent"])
        assert values == ["value1", "value2", "value3", None]

    def test_mset(self, cache):
        """测试批量设置"""
        cache.mset({
            "mkey1": "mvalue1",
            "mkey2": "mvalue2",
            "mkey3": "mvalue3"
        })
        
        assert cache.get("mkey1") == "mvalue1"
        assert cache.get("mkey2") == "mvalue2"
        assert cache.get("mkey3") == "mvalue3"