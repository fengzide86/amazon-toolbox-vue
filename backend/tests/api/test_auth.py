"""
认证 API 集成测试
测试所有认证相关接口
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Setting, Plan, AuthCode, User
from core.security import hash_password


class TestHealthCheck:
    """健康检查测试"""
    
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """测试健康检查接口"""
        response = await client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "checks" in data
        assert data["checks"]["database"]["status"] == "ok"


class TestAdminLogin:
    """管理员登录测试"""
    
    @pytest.mark.asyncio
    async def test_admin_login_success(self, client: AsyncClient, db_session: AsyncSession):
        """测试管理员正确密码登录"""
        # 设置管理员密码
        setting = Setting(
            key="admin_password",
            value=hash_password("admin123")
        )
        db_session.add(setting)
        await db_session.commit()
        
        response = await client.post("/api/auth/admin-login", json={"password": "admin123"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "token" in data["data"]
        assert data["data"]["role"] == "admin"
    
    @pytest.mark.asyncio
    async def test_admin_login_wrong_password(self, client: AsyncClient, db_session: AsyncSession):
        """测试管理员错误密码"""
        setting = Setting(
            key="admin_password",
            value=hash_password("correct_password")
        )
        db_session.add(setting)
        await db_session.commit()
        
        response = await client.post("/api/auth/admin-login", json={"password": "wrong_password"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
    
    @pytest.mark.asyncio
    async def test_admin_login_no_password_set(self, client: AsyncClient):
        """测试未设置管理员密码"""
        response = await client.post("/api/auth/admin-login", json={"password": "any_password"})
        
        data = response.json()
        assert data["success"] is False
    
    @pytest.mark.asyncio
    async def test_admin_login_empty_password(self, client: AsyncClient):
        """测试空密码"""
        response = await client.post("/api/auth/admin-login", json={"password": ""})
        
        data = response.json()
        assert data["success"] is False


class TestAuthVerify:
    """授权码验证测试"""
    
    @pytest.mark.asyncio
    async def test_verify_valid_code(self, client: AsyncClient, db_session: AsyncSession):
        """测试有效授权码验证"""
        # 创建套餐
        plan = Plan(name="测试套餐", price=99.00, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        
        # 创建授权码
        auth_code = AuthCode(
            code="VALID-TEST-CODE",
            plan_id=plan.id,
            max_devices=1,
            status="unused"
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        response = await client.post("/api/auth/verify", json={
            "code": "VALID-TEST-CODE",
            "device_id": "device-001",
            "device_name": "测试设备"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "token" in data["data"]
        assert data["data"]["plan_name"] == "测试套餐"
    
    @pytest.mark.asyncio
    async def test_verify_invalid_code(self, client: AsyncClient):
        """测试无效授权码"""
        response = await client.post("/api/auth/verify", json={
            "code": "INVALID-CODE-12345",
            "device_id": "device-001",
            "device_name": "测试设备"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "无效" in data["message"]
    
    @pytest.mark.asyncio
    async def test_verify_frozen_code(self, client: AsyncClient, db_session: AsyncSession):
        """测试冻结的授权码"""
        auth_code = AuthCode(code="FROZEN-CODE", status="frozen")
        db_session.add(auth_code)
        await db_session.commit()
        
        response = await client.post("/api/auth/verify", json={
            "code": "FROZEN-CODE",
            "device_id": "device-001",
            "device_name": "测试设备"
        })
        
        data = response.json()
        assert data["success"] is False
        assert "冻结" in data["message"]
    
    @pytest.mark.asyncio
    async def test_verify_expired_code(self, client: AsyncClient, db_session: AsyncSession):
        """测试过期的授权码"""
        from datetime import datetime, timedelta
        
        auth_code = AuthCode(
            code="EXPIRED-CODE",
            status="expired",
            expires_at=datetime.now() - timedelta(days=1)
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        response = await client.post("/api/auth/verify", json={
            "code": "EXPIRED-CODE",
            "device_id": "device-001",
            "device_name": "测试设备"
        })
        
        data = response.json()
        assert data["success"] is False
        assert "过期" in data["message"]
    
    @pytest.mark.asyncio
    async def test_verify_code_with_device_limit(self, client: AsyncClient, db_session: AsyncSession):
        """测试设备数量限制"""
        from models import Device
        
        # 创建套餐和授权码
        plan = Plan(name="单设备套餐", price=49.00, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        
        auth_code = AuthCode(
            code="LIMIT-CODE",
            plan_id=plan.id,
            max_devices=1,
            status="active"
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        # 创建用户
        user = User(auth_code_id=auth_code.id, device_id="existing-device")
        db_session.add(user)
        await db_session.commit()
        auth_code.user_id = user.id
        await db_session.commit()
        
        # 添加一个已绑定的设备
        device = Device(auth_code_id=auth_code.id, device_id="existing-device")
        db_session.add(device)
        await db_session.commit()
        
        # 尝试用新设备登录（应该失败）
        response = await client.post("/api/auth/verify", json={
            "code": "LIMIT-CODE",
            "device_id": "new-device-002",
            "device_name": "新设备"
        })
        
        data = response.json()
        assert data["success"] is False
        assert "设备上限" in data["message"]
    
    @pytest.mark.asyncio
    async def test_verify_code_multiple_devices(self, client: AsyncClient, db_session: AsyncSession):
        """测试多设备支持"""
        from models import Device
        
        # 创建套餐和授权码（支持3台设备）
        plan = Plan(name="多设备套餐", price=199.00, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        
        auth_code = AuthCode(
            code="MULTI-DEVICE-CODE",
            plan_id=plan.id,
            max_devices=3,
            status="active"
        )
        db_session.add(auth_code)
        await db_session.commit()
        
        # 创建用户
        user = User(auth_code_id=auth_code.id, device_id="device-1")
        db_session.add(user)
        await db_session.commit()
        auth_code.user_id = user.id
        await db_session.commit()
        
        # 添加第一台设备
        device1 = Device(auth_code_id=auth_code.id, device_id="device-1")
        db_session.add(device1)
        await db_session.commit()
        
        # 用第二台设备登录（应该成功）
        response = await client.post("/api/auth/verify", json={
            "code": "MULTI-DEVICE-CODE",
            "device_id": "device-2",
            "device_name": "第二台设备"
        })
        
        data = response.json()
        assert data["success"] is True
        assert "token" in data["data"]


class TestGetCurrentUser:
    """获取当前用户信息测试"""
    
    @pytest.mark.asyncio
    async def test_get_current_user_with_valid_token(self, client: AsyncClient, admin_token: str):
        """测试带有效 Token 获取用户信息"""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["role"] == "admin"
    
    @pytest.mark.asyncio
    async def test_get_current_user_without_token(self, client: AsyncClient):
        """测试不带 Token 获取用户信息"""
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 403
    
    @pytest.mark.asyncio
    async def test_get_current_user_with_invalid_token(self, client: AsyncClient):
        """测试带无效 Token 获取用户信息"""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        
        assert response.status_code == 401


class TestRefreshToken:
    """Token 刷新测试"""
    
    @pytest.mark.asyncio
    async def test_refresh_token_success(self, client: AsyncClient, admin_token: str):
        """测试成功刷新 Token"""
        response = await client.post(
            "/api/auth/refresh",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "token" in data["data"]
        
        # 新 Token 应该可以使用
        new_token = data["data"]["token"]
        response2 = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert response2.status_code == 200
    
    @pytest.mark.asyncio
    async def test_refresh_token_without_token(self, client: AsyncClient):
        """测试不带 Token 刷新"""
        response = await client.post("/api/auth/refresh")
        
        assert response.status_code == 403


class TestCheckAuthStatus:
    """授权状态检查测试"""
    
    @pytest.mark.asyncio
    async def test_check_auth_status_admin(self, client: AsyncClient, admin_token: str):
        """测试管理员检查状态"""
        response = await client.post(
            "/api/auth/check",
            json={"code": "test", "device_id": "test", "device_name": ""},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["role"] == "admin"
    
    @pytest.mark.asyncio
    async def test_check_auth_status_without_token(self, client: AsyncClient):
        """测试不带 Token 检查状态"""
        response = await client.post(
            "/api/auth/check",
            json={"code": "test", "device_id": "test", "device_name": ""}
        )
        
        assert response.status_code == 403