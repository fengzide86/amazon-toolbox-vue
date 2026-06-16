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