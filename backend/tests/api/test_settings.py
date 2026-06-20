"""
系统设置 API 集成测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Setting
from core.security import verify_password


class TestGetSettings:
    """获取系统设置测试"""
    
    @pytest.mark.asyncio
    async def test_get_settings_requires_admin(self, client: AsyncClient):
        """测试获取设置需要管理员权限"""
        response = await client.get("/api/settings")
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_get_settings_with_admin(self, client: AsyncClient, auth_headers: dict):
        """测试管理员获取设置列表（需要管理员权限）"""
        response = await client.get("/api/settings", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    @pytest.mark.asyncio
    async def test_get_settings_hides_admin_password(self, client: AsyncClient, auth_headers: dict):
        """测试获取设置时隐藏管理员密码（需要管理员权限）"""
        response = await client.get("/api/settings", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        # 如果有 admin_password，值应该是隐藏的
        password_settings = [s for s in data if s["key"] == "admin_password"]
        if password_settings:
            assert password_settings[0]["value"] == "********"


class TestGetPublicSettings:
    """公开设置接口测试（无需认证）"""

    @pytest.mark.asyncio
    async def test_get_public_settings_no_auth_required(self, client: AsyncClient):
        """测试公开设置接口无需认证即可访问"""
        response = await client.get("/api/settings/public")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_public_settings_returns_public_keys(self, client: AsyncClient, db_session: AsyncSession):
        """测试公开设置只返回白名单中的 key"""
        # 插入公开 key 和非公开 key
        db_session.add(Setting(key="wechat_id", value="wx_123"))
        db_session.add(Setting(key="service_wechat", value="wx_456"))
        db_session.add(Setting(key="admin_password", value="secret_hash"))
        await db_session.commit()

        response = await client.get("/api/settings/public")
        assert response.status_code == 200
        data = response.json()
        keys = [s["key"] for s in data]

        # 公开 key 应返回
        assert "wechat_id" in keys
        assert "service_wechat" in keys
        # 非公开 key 不应返回
        assert "admin_password" not in keys

    @pytest.mark.asyncio
    async def test_get_public_settings_includes_wechat_id(self, client: AsyncClient, db_session: AsyncSession):
        """测试公开设置包含 wechat_id（登录页依赖此字段）"""
        db_session.add(Setting(key="wechat_id", value="AmazonToolbox_Support"))
        await db_session.commit()

        response = await client.get("/api/settings/public")
        data = response.json()
        wx = next((s for s in data if s["key"] == "wechat_id"), None)
        assert wx is not None
        assert wx["value"] == "AmazonToolbox_Support"

    @pytest.mark.asyncio
    async def test_get_public_settings_empty_db(self, client: AsyncClient):
        """测试数据库为空时公开接口返回空列表"""
        response = await client.get("/api/settings/public")
        assert response.status_code == 200
        assert response.json() == []


class TestUpdateSetting:
    """更新系统设置测试"""
    
    @pytest.mark.asyncio
    async def test_update_existing_setting(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试更新已有设置"""
        setting = Setting(key="site_name", value="旧名称", description="网站名称")
        db_session.add(setting)
        await db_session.commit()
        
        response = await client.put("/api/settings", json={
            "key": "site_name",
            "value": "新名称",
            "description": "更新后的描述"
        }, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # 验证数据库
        await db_session.refresh(setting)
        assert setting.value == "新名称"
    
    @pytest.mark.asyncio
    async def test_create_new_setting(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试创建新设置"""
        response = await client.put("/api/settings", json={
            "key": "new_setting",
            "value": "new_value",
            "description": "新设置"
        }, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_update_admin_password_hashes(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试更新管理员密码时使用 bcrypt 哈希"""
        response = await client.put("/api/settings", json={
            "key": "admin_password",
            "value": "new_password_123"
        }, headers=auth_headers)
        
        assert response.status_code == 200
        
        # 验证密码已哈希存储
        from sqlalchemy import select
        result = await db_session.execute(
            select(Setting).where(Setting.key == "admin_password")
        )
        setting = result.scalars().first()
        assert setting.value.startswith("$2b$")
        assert verify_password("new_password_123", setting.value) is True
    
    @pytest.mark.asyncio
    async def test_update_setting_without_auth(self, client: AsyncClient):
        """测试未认证更新设置"""
        response = await client.put("/api/settings", json={
            "key": "site_name",
            "value": "未授权修改"
        })
        
        assert response.status_code == 403