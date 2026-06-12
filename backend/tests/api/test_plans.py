"""
套餐管理 API 集成测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models import Plan, Setting
from core.security import hash_password


class TestGetPlans:
    """获取套餐列表测试"""
    
    @pytest.mark.asyncio
    async def test_get_plans_empty(self, client: AsyncClient):
        """测试获取空套餐列表"""
        response = await client.get("/api/plans")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    @pytest.mark.asyncio
    async def test_get_plans_with_data(self, client: AsyncClient, db_session: AsyncSession):
        """测试获取套餐列表（有数据）"""
        # 创建测试套餐
        plan1 = Plan(name="月度套餐", price=99.00, duration_days=30, status="active")
        plan2 = Plan(name="年度套餐", price=999.00, duration_days=365, status="active")
        db_session.add_all([plan1, plan2])
        await db_session.commit()
        
        response = await client.get("/api/plans")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] in ["月度套餐", "年度套餐"]
    
    @pytest.mark.asyncio
    async def test_get_plans_excludes_deleted(self, client: AsyncClient, db_session: AsyncSession):
        """测试获取套餐列表排除已删除"""
        active_plan = Plan(name="有效套餐", price=99.00, duration_days=30, status="active")
        deleted_plan = Plan(name="已删除套餐", price=49.00, duration_days=15, status="deleted")
        db_session.add_all([active_plan, deleted_plan])
        await db_session.commit()
        
        response = await client.get("/api/plans")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "有效套餐"


class TestCreatePlan:
    """创建套餐测试"""
    
    @pytest.mark.asyncio
    async def test_create_plan_success(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试成功创建套餐"""
        plan_data = {
            "name": "新套餐",
            "price": 199.00,
            "duration_days": 60,
            "features": '["功能1", "功能2"]',
            "status": "active"
        }
        
        response = await client.post("/api/plans", json=plan_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "新套餐"
        assert float(data["price"]) == 199.00
        assert data["duration_days"] == 60
    
    @pytest.mark.asyncio
    async def test_create_plan_without_auth(self, client: AsyncClient):
        """测试未认证创建套餐"""
        plan_data = {
            "name": "未授权套餐",
            "price": 99.00,
            "duration_days": 30
        }
        
        response = await client.post("/api/plans", json=plan_data)
        
        assert response.status_code == 403


class TestUpdatePlan:
    """更新套餐测试"""
    
    @pytest.mark.asyncio
    async def test_update_plan_success(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试成功更新套餐"""
        # 创建套餐
        plan = Plan(name="原套餐", price=99.00, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        
        update_data = {
            "name": "更新后套餐",
            "price": 149.00
        }
        
        response = await client.put(f"/api/plans/{plan.id}", json=update_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "更新后套餐"
        assert float(data["price"]) == 149.00
    
    @pytest.mark.asyncio
    async def test_update_plan_not_found(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试更新不存在的套餐"""
        response = await client.put("/api/plans/99999", json={"name": "不存在"}, headers=auth_headers)
        
        assert response.status_code == 404


class TestDeletePlan:
    """删除套餐测试"""
    
    @pytest.mark.asyncio
    async def test_delete_plan_success(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试成功删除套餐（软删除）"""
        # 创建套餐
        plan = Plan(name="待删除套餐", price=99.00, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        
        response = await client.delete(f"/api/plans/{plan.id}", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # 验证是软删除
        await db_session.refresh(plan)
        assert plan.status == "deleted"
    
    @pytest.mark.asyncio
    async def test_delete_plan_not_found(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试删除不存在的套餐"""
        response = await client.delete("/api/plans/99999", headers=auth_headers)
        
        assert response.status_code == 404