"""
工具配置接口测试
"""
import pytest
from httpx import AsyncClient

from routers.tools import normalize_tool_config, resolve_tool_runtime


def test_resolve_tool_runtime_supports_legacy_tool_config():
    script_key, target_url = resolve_tool_runtime(
        {"id": "tool_listing", "capability_key": "listing_script"},
        "amazon",
    )

    assert script_key == "amazon.listing_script.v1"
    assert target_url == ""


def test_normalize_tool_config_fills_operational_fields():
    tool = normalize_tool_config(
        {
            "name": "亚马逊注册页面巡检",
            "module": "注册工具",
            "platform_key": "amazon",
            "capability_key": "register",
        },
        0,
    )

    assert tool["id"] == "tool_register"
    assert tool["script_key"] == "demo.register_v1"
    assert tool["target_url"] == ""
    assert tool["availability"] == "demo_only"
    assert tool["tool_version"] == "1.0.0"
    assert tool["runner_api_version"] == 1
    assert tool["status"] == "online"
    assert tool["release_status"] == "available"


def test_normalize_tool_config_turns_invalid_status_into_maintenance():
    tool = normalize_tool_config(
        {
            "id": "工具 A",
            "release_status": "bad-value",
            "status": "bad-value",
            "available_plans": "Y49, Y199",
        },
        0,
    )

    assert tool["id"] == "a"
    assert tool["release_status"] == "maintenance"
    assert tool["status"] == "maintenance"
    assert tool["available_plans"] == ["Y49", "Y199"]


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
        import json

        from models import Setting
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
        import json

        from models import Setting
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
        import json

        from models import Setting
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
        import json

        from models import Setting
        tools = [{"name": "DataTool", "module": "Module", "status": "online"}]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"search": "data"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_get_tools_platform_filter_normalizes_legacy_tools_first(self, client: AsyncClient, db_session):
        """旧工具没有 platform_key 时，平台筛选前应先补齐默认运行字段"""
        import json

        from models import Setting
        tools = [{"id": "tool_reg_newbie", "name": "旧注册工具", "module": "注册工具", "status": "online"}]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools", params={"platform_key": "amazon"})

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["platform_key"] == "amazon"
        assert data[0]["script_key"] == "demo.tool_reg_newbie_v1"
        assert data[0]["target_url"] == ""

    async def test_get_tools_category_all(self, client: AsyncClient, db_session, auth_headers: dict):
        """category=all 返回全部"""
        import json

        from models import Setting
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
        import json

        from models import Setting
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
        import json

        from models import Setting
        # 先写入初始数据
        tools = [{"name": "新工具", "module": "模块", "status": "online"}]
        db_session.add(Setting(key="tool_configs", value=json.dumps(tools, ensure_ascii=False)))
        await db_session.commit()

        resp = await client.get("/api/tools")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "新工具"

    async def test_internal_update_cannot_enable_live_runtime(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        response = await client.put(
            "/api/tools",
            headers=auth_headers,
            json=[{
                "id": "unsafe-live-tool",
                "name": "待演示工具",
                "module": "内部验证",
                "availability": "live",
                "supports_live_single": True,
                "supports_live_batch": True,
                "target_url": "https://sellercentral.amazon.com/",
                "script_key": "amazon.unsafe.v1",
            }],
        )

        assert response.status_code == 200
        tool = response.json()["data"][0]
        assert tool["availability"] == "demo_only"
        assert tool["supports_live_single"] is False
        assert tool["supports_live_batch"] is False
        assert tool["target_url"] == ""
        assert tool["script_key"].startswith("demo.")
