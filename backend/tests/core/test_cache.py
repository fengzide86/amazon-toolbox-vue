"""Current asynchronous cache contract tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from core.cache import CacheManager


@pytest.fixture
def cache() -> CacheManager:
    return CacheManager()


@pytest.mark.asyncio
async def test_returns_none_without_redis(cache: CacheManager) -> None:
    assert await cache.get("missing") is None
    assert await cache.set("key", "value") is False
    assert await cache.exists("key") is False


@pytest.mark.asyncio
async def test_get_deserializes_json(cache: CacheManager) -> None:
    cache.redis = SimpleNamespace(get=AsyncMock(return_value='{"ok": true}'))
    assert await cache.get("key") == {"ok": True}


@pytest.mark.asyncio
async def test_set_uses_expiring_json(cache: CacheManager) -> None:
    setex = AsyncMock()
    cache.redis = SimpleNamespace(setex=setex)
    assert await cache.set("key", {"value": 1}, ttl=60) is True
    setex.assert_awaited_once_with("key", 60, '{"value": 1}')


@pytest.mark.asyncio
async def test_delete_and_exists(cache: CacheManager) -> None:
    delete = AsyncMock(return_value=1)
    exists = AsyncMock(return_value=1)
    cache.redis = SimpleNamespace(delete=delete, exists=exists)
    assert await cache.delete("key") is True
    assert await cache.exists("key") is True


@pytest.mark.asyncio
async def test_delete_pattern_scans_until_complete(cache: CacheManager) -> None:
    scan = AsyncMock(side_effect=[(1, ["item:1"]), (0, ["item:2"])])
    delete = AsyncMock(return_value=1)
    cache.redis = SimpleNamespace(scan=scan, delete=delete)
    assert await cache.delete_pattern("item:*") == 2


@pytest.mark.asyncio
async def test_incr_sets_ttl_only_on_first_value(cache: CacheManager) -> None:
    incrby = AsyncMock(return_value=2)
    expire = AsyncMock()
    cache.redis = SimpleNamespace(incrby=incrby, expire=expire)
    assert await cache.incr("counter", amount=2, ttl=30) == 2
    expire.assert_awaited_once_with("counter", 30)


@pytest.mark.asyncio
async def test_get_ttl(cache: CacheManager) -> None:
    cache.redis = SimpleNamespace(ttl=AsyncMock(return_value=42))
    assert await cache.get_ttl("key") == 42
