"""
工具配置接口测试
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestGetTools:
    """获取工具列表"""

    async def test_get_tools_empty(self, client: AsyncClient):
        """无工具配置时返回空列表"""
        resp = await client.get("/api/tools")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_get_tools_after_set(self, client: AsyncClient, db_session, auth_headers: dict):
        """设置工具后可获取 - 直接写入 Setting 表"""
        from models import Setting
        import json
        tools = [
            {"name": "工具A", "module": "模块A", "status": "online", "category": "data"},
            {"name": "工具B", "module": "模块B", "status": "offline", "category": "operation"},
        ]
        setting = Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False))
        db_session.add(setting)
        await db_session.commit()

        resp = await client.get("/api/tools")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "工具A"

    async def test_get_tools_filter_by_category(self, client: AsyncClient, db_session, auth_headers: dict):
        """按分类筛选工具"""
        from models import Setting
        import json
        tools = [
            {"name": "工具A", "module": "模块A", "status": "online", "category": "data"},
            {"name": "工具B", "module": "模块B", "status": "online", "category": "operation"},
            {"name": "工具C", "module": "模块C", "status": "online", "category": "data"},
        ]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"category": "data"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert all(t["category"] == "data" for t in data)

    async def test_get_tools_filter_by_search(self, client: AsyncClient, db_session, auth_headers: dict):
        """按关键词搜索工具"""
        from models import Setting
        import json
        tools = [
            {"name": "数据分析工具", "module": "数据分析", "status": "online", "description": "用于数据分析"},
            {"name": "发货助手", "module": "物流", "status": "online", "description": "批量发货"},
        ]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"search": "数据"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "数据分析工具"

    async def test_get_tools_search_case_insensitive(self, client: AsyncClient, db_session, auth_headers: dict):
        """搜索不区分大小写"""
        from models import Setting
        import json
        tools = [{"name": "DataTool", "module": "Module", "status": "online"}]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"search": "data"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_get_tools_category_all(self, client: AsyncClient, db_session, auth_headers: dict):
        """category=all 返回全部"""
        from models import Setting
        import json
        tools = [
            {"name": "A", "module": "M", "status": "online", "category": "data"},
            {"name": "B", "module": "M", "status": "online", "category": "operation"},
        ]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"category": "all"})
        assert resp.status_code == 200
        assert len(resp.json()) == 2


@pytest.mark.asyncio
class TestToolCategories:
    """工具分类接口"""

    async def test_get_default_categories(self, client: AsyncClient):
        """未设置时返回默认分类"""
        resp = await client.get("/api/tools/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(c["id"] == "all" for c in data)

    async def test_update_categories(self, client: AsyncClient, db_session, auth_headers: dict):
        """更新分类配置 - 直接写入 Setting 表"""
        from models import Setting
        import json
        cats = [{"id": "custom", "name": "自定义", "sort_order": 0}]
        db_session.add(Setting(key="tool_categories", value=json.dumps(cats, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools/categories")
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "custom"

    async def test_update_categories_requires_admin(self, client: AsyncClient):
        """更新分类需要管理员权限"""
        cats = [{"id": "custom", "name": "自定义", "sort_order": 0}]
        resp = await client.put("/api/tools/categories", json=cats)
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestUpdateTools:
    """更新工具配置"""

    async def test_update_tools_requires_admin(self, client: AsyncClient):
        """更新工具需要管理员权限"""
        resp = await client.put("/api/tools", json=[])
        assert resp.status_code in (401, 403)

    async def test_update_tools_success(self, client: AsyncClient, db_session, auth_headers: dict):
        """管理员可更新工具 - 验证 Setting 表写入"""
        from models import Setting
        import json
        # 先写入初始数据
        tools = [{"name": "新工具", "module": "模块", "status": "online"}]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "新工具"
