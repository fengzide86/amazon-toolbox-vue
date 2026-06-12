"""
pytest 测试配置和公共 fixtures
"""
import pytest
import asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch

# 设置测试环境变量
import os
os.environ["APP_ENV"] = "test"

# 在导入 app 之前，将 Limiter.limit 装饰器替换为无操作装饰器
# 这样所有路由的频率限制都会被禁用
def _noop_limit(*args, **kwargs):
    """无操作的 limit 装饰器，用于测试环境"""
    def decorator(func):
        return func
    return decorator

# 补丁 Limiter.limit 方法
import slowapi
slowapi.Limiter.limit = _noop_limit

from database import Base, get_db
from core.config import settings
from main import app


# 测试数据库 URL (使用 SQLite 内存数据库)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# 创建测试引擎
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    每个测试函数使用独立的数据库会话
    测试完成后自动回滚
    """
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with test_session_maker() as session:
        yield session
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    测试用 HTTP 客户端
    自动注入数据库会话
    """
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
async def admin_token(client: AsyncClient, db_session: AsyncSession) -> str:
    """获取管理员 Token"""
    from models import Setting
    from core.security import hash_password
    from sqlalchemy import select
    
    # 检查是否已有管理员密码
    result = await db_session.execute(select(Setting).where(Setting.key == "admin_password"))
    setting = result.scalars().first()
    
    if not setting:
        # 创建管理员密码
        setting = Setting(key="admin_password", value=hash_password("admin123"))
        db_session.add(setting)
        await db_session.commit()
    else:
        # 更新为已知密码
        setting.value = hash_password("admin123")
        await db_session.commit()
    
    response = await client.post("/api/auth/admin-login", json={"password": "admin123"})
    data = response.json()
    if data.get("success") and data.get("data", {}).get("token"):
        return data["data"]["token"]
    raise Exception(f"获取管理员 Token 失败: {data}")


@pytest.fixture(scope="function")
async def auth_headers(admin_token: str) -> dict:
    """获取认证请求头"""
    return {"Authorization": f"Bearer {admin_token}"}


# ===== 测试数据工厂 =====

@pytest.fixture
def sample_plan_data():
    """套餐测试数据"""
    return {
        "name": "测试套餐",
        "price": 99.00,
        "duration_days": 30,
        "features": '["功能1", "功能2"]',
        "status": "active"
    }


@pytest.fixture
def sample_auth_code_data():
    """授权码测试数据"""
    return {
        "code": "TEST-CODE-12345",
        "plan_id": 1,
        "max_devices": 1,
        "status": "unused"
    }


@pytest.fixture
def sample_user_data():
    """用户测试数据"""
    return {
        "name": "测试用户",
        "phone": "13800138000",
        "device_id": "test-device-001",
        "device_name": "Test Device"
    }


@pytest.fixture
def sample_order_data():
    """订单测试数据"""
    return {
        "order_no": "ORD-2024-001",
        "plan_id": 1,
        "amount": 99.00,
        "channel": "微信",
        "responsible": "张三",
        "status": "pending"
    }


@pytest.fixture
def sample_feedback_data():
    """工单测试数据"""
    return {
        "title": "测试工单",
        "content": "这是一个测试工单内容",
        "status": "pending"
    }