"""
运行日志接口测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import RunLog, User, AuthCode, Plan
from tests.conftest import get_data


async def seed_logs(db_session: AsyncSession):
    """创建测试日志数据"""
    # 先创建用户
    plan = Plan(name="测试", price=99, duration_days=30, status="active")
    db_session.add(plan)
    await db_session.flush()

    user = User(device_id="dev1", device_name="PC1", auth_code_id=1)
    db_session.add(user)
    await db_session.flush()

    logs = [
        RunLog(user_id=user.id, device_id="dev1", tool_name="工具A", module="模块1", status="success", detail="OK"),
        RunLog(user_id=user.id, device_id="dev1", tool_name="工具B", module="模块2", status="failed", detail="Error"),
        RunLog(user_id=user.id, device_id="dev1", tool_name="工具A", module="模块1", status="success", detail="OK"),
    ]
    for log in logs:
        db_session.add(log)
    await db_session.commit()
    return user


@pytest.mark.asyncio
class TestGetLogs:
    """获取日志列表"""

    async def test_get_logs_empty(self, client: AsyncClient, auth_headers: dict):
        """无日志时返回空列表"""
        resp = await client.get("/api/logs", headers=auth_headers)
        assert resp.status_code == 200
        assert get_data(resp) == []

    async def test_get_logs_with_data(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """有日志时返回数据"""
        user = await seed_logs(db_session)
        resp = await client.get("/api/logs", params={"user_id": user.id}, headers=auth_headers)
        assert resp.status_code == 200
        data = get_data(resp)
        assert len(data) == 3

    async def test_get_logs_filter_by_tool(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """按工具名筛选"""
        user = await seed_logs(db_session)
        resp = await client.get("/api/logs", params={"user_id": user.id, "tool_name": "工具A"}, headers=auth_headers)
        assert resp.status_code == 200
        data = get_data(resp)
        assert len(data) == 2
        assert all(log["tool_name"] == "工具A" for log in data)

    async def test_get_logs_filter_by_status(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """按状态筛选"""
        user = await seed_logs(db_session)
        resp = await client.get("/api/logs", params={"user_id": user.id, "status": "success"}, headers=auth_headers)
        assert resp.status_code == 200
        data = get_data(resp)
        assert len(data) == 2
        assert all(log["status"] == "success" for log in data)


@pytest.mark.asyncio
class TestGetLogTools:
    """获取工具名称列表"""

    async def test_get_log_tools_empty(self, client: AsyncClient, auth_headers: dict):
        """无日志时返回空列表"""
        resp = await client.get("/api/logs/tools", headers=auth_headers)
        assert resp.status_code == 200
        assert get_data(resp) == []

    async def test_get_log_tools_unique(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """返回去重的工具名"""
        await seed_logs(db_session)
        resp = await client.get("/api/logs/tools", headers=auth_headers)
        assert resp.status_code == 200
        data = get_data(resp)
        assert "工具A" in data
        assert "工具B" in data
        assert len(data) == 2


@pytest.mark.asyncio
class TestExportLogs:
    """导出日志 CSV"""

    async def test_export_logs_empty(self, client: AsyncClient, auth_headers: dict):
        """无日志时导出空 CSV"""
        resp = await client.get("/api/logs/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    async def test_export_logs_with_data(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """有日志时导出含数据"""
        await seed_logs(db_session)
        resp = await client.get("/api/logs/export", headers=auth_headers)
        assert resp.status_code == 200
        content = resp.text
        assert "工具A" in content
        assert "工具B" in content
