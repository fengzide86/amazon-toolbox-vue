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
    async def test_get_settings_empty(self, client: AsyncClient):
        """测试获取空设置列表"""
        response = await client.get("/api/settings")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    @pytest.mark.asyncio
    async def test_get_settings_with_data(self, client: AsyncClient, db_session: AsyncSession):
        """测试获取设置列表（有数据）"""
        setting1 = Setting(key="site_name", value="亚马逊工具箱", description="网站名称")
        setting2 = Setting(key="profit_ratios", value='{"tech": 0.3}', description="分润比例")
        db_session.add_all([setting1, setting2])
        await db_session.commit()
        
        response = await client.get("/api/settings")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
    
    @pytest.mark.asyncio
    async def test_get_settings_hides_admin_password(self, client: AsyncClient, db_session: AsyncSession):
        """测试获取设置时隐藏管理员密码"""
        from core.security import hash_password
        setting = Setting(
            key="admin_password",
            value=hash_password("secret123"),
            description="管理员密码"
        )
        db_session.add(setting)
        await db_session.commit()
        
        response = await client.get("/api/settings")
        
        assert response.status_code == 200
        data = response.json()
        password_setting = next(s for s in data if s["key"] == "admin_password")
        assert password_setting["value"] == "********"


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