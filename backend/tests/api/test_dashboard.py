"""
数据看板 API 集成测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from models import Order, AuthCode, User, RunLog, Feedback, Plan


class TestGetDashboard:
    """数据总览测试"""
    
    @pytest.mark.asyncio
    async def test_get_dashboard_empty(self, client: AsyncClient, auth_headers: dict):
        """测试空数据看板"""
        response = await client.get("/api/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_revenue"] == 0
        assert data["total_orders"] == 0
        assert data["active_codes"] == 0
        assert data["total_users"] == 0
        assert data["today_runs"] == 0
        assert data["pending_tickets"] == 0
        assert data["recent_logs"] == []
    
    @pytest.mark.asyncio
    async def test_get_dashboard_with_orders(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试有订单数据的看板"""
        # 创建订单
        order1 = Order(order_no="ORD-001", amount=99.00, status="paid")
        order2 = Order(order_no="ORD-002", amount=199.00, status="paid")
        order3 = Order(order_no="ORD-003", amount=50.00, status="pending")
        db_session.add_all([order1, order2, order3])
        await db_session.commit()
        
        response = await client.get("/api/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_orders"] == 3
        assert data["total_revenue"] == 298.00  # 只计算 paid 和 refunded
    
    @pytest.mark.asyncio
    async def test_get_dashboard_with_users(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试有用户数据的看板"""
        user1 = User(name="用户1", device_id="device-001")
        user2 = User(name="用户2", device_id="device-002")
        db_session.add_all([user1, user2])
        await db_session.commit()
        
        response = await client.get("/api/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 2
    
    @pytest.mark.asyncio
    async def test_get_dashboard_with_active_codes(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试有授权码数据的看板"""
        code1 = AuthCode(code="CODE-001", status="active")
        code2 = AuthCode(code="CODE-002", status="active")
        code3 = AuthCode(code="CODE-003", status="unused")
        db_session.add_all([code1, code2, code3])
        await db_session.commit()
        
        response = await client.get("/api/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["active_codes"] == 2
    
    @pytest.mark.asyncio
    async def test_get_dashboard_with_pending_feedback(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试有待处理工单的看板"""
        feedback1 = Feedback(title="工单1", status="pending")
        feedback2 = Feedback(title="工单2", status="resolved")
        db_session.add_all([feedback1, feedback2])
        await db_session.commit()
        
        response = await client.get("/api/dashboard", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["pending_tickets"] == 1
    
    @pytest.mark.asyncio
    async def test_get_dashboard_without_auth(self, client: AsyncClient):
        """测试未认证访问看板"""
        response = await client.get("/api/dashboard")
        
        assert response.status_code == 403


class TestGetDashboardCharts:
    """图表数据测试"""
    
    @pytest.mark.asyncio
    async def test_get_charts_empty(self, client: AsyncClient, auth_headers: dict):
        """测试空数据图表"""
        response = await client.get("/api/dashboard/charts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "revenue_trend" in data
        assert "plan_distribution" in data
        assert "tool_success_rate" in data
        assert len(data["revenue_trend"]) == 7  # 近7天
    
    @pytest.mark.asyncio
    async def test_get_charts_revenue_trend(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试收入趋势数据"""
        # 创建今天的订单
        order = Order(order_no="ORD-TODAY", amount=100.00, status="paid", created_at=datetime.now())
        db_session.add(order)
        await db_session.commit()
        
        response = await client.get("/api/dashboard/charts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["revenue_trend"]) == 7
        # 今天的数据应该有值
        today_data = data["revenue_trend"][-1]
        assert today_data["amount"] >= 0
    
    @pytest.mark.asyncio
    async def test_get_charts_plan_distribution(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试套餐分布数据"""
        # 创建套餐和订单
        plan1 = Plan(name="月度套餐", price=99.00, duration_days=30, status="active")
        plan2 = Plan(name="年度套餐", price=999.00, duration_days=365, status="active")
        db_session.add_all([plan1, plan2])
        await db_session.commit()
        
        order1 = Order(order_no="ORD-001", plan_id=plan1.id, amount=99.00, status="paid")
        order2 = Order(order_no="ORD-002", plan_id=plan2.id, amount=999.00, status="paid")
        db_session.add_all([order1, order2])
        await db_session.commit()
        
        response = await client.get("/api/dashboard/charts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["plan_distribution"]) >= 2
    
    @pytest.mark.asyncio
    async def test_get_charts_tool_success_rate(self, client: AsyncClient, db_session: AsyncSession, auth_headers: dict):
        """测试工具成功率数据"""
        # 创建运行日志
        log1 = RunLog(tool_name="工具A", status="success")
        log2 = RunLog(tool_name="工具A", status="success")
        log3 = RunLog(tool_name="工具A", status="failed")
        log4 = RunLog(tool_name="工具B", status="success")
        db_session.add_all([log1, log2, log3, log4])
        await db_session.commit()
        
        response = await client.get("/api/dashboard/charts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["tool_success_rate"]) >= 1
        # 工具A的成功率应该是 67% (2/3)
        tool_a = next((t for t in data["tool_success_rate"] if t["name"] == "工具A"), None)
        assert tool_a is not None
        assert tool_a["rate"] == 67
    
    @pytest.mark.asyncio
    async def test_get_charts_without_auth(self, client: AsyncClient):
        """测试未认证访问图表"""
        response = await client.get("/api/dashboard/charts")
        
        assert response.status_code == 403