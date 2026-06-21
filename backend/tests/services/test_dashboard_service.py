"""
仪表盘服务测试
"""
import pytest
from datetime import datetime, timedelta, timezone
from backend.services.dashboard_service import DashboardService
from backend.models import User, Order, Plan
from backend.database import SessionLocal


class TestDashboardService:
    """仪表盘服务测试"""

    @pytest.fixture
    def dashboard_service(self):
        """创建仪表盘服务实例"""
        db = SessionLocal()
        try:
            yield DashboardService(db)
        finally:
            db.close()

    @pytest.fixture
    def test_data(self, dashboard_service):
        """创建测试数据"""
        # 创建用户
        users = []
        for i in range(5):
            user = User(
                username=f"user_{i}",
                email=f"user{i}@example.com",
                hashed_password="hashed",
                role="user"
            )
            dashboard_service.db.add(user)
            users.append(user)
        
        dashboard_service.db.commit()
        for user in users:
            dashboard_service.db.refresh(user)
        
        # 创建套餐
        plan = Plan(
            name="Test Plan",
            price=99.99,
            duration_days=30
        )
        dashboard_service.db.add(plan)
        dashboard_service.db.commit()
        dashboard_service.db.refresh(plan)
        
        # 创建订单
        orders = []
        for i in range(3):
            order = Order(
                user_id=users[i].id,
                plan_id=plan.id,
                amount=99.99,
                status="paid",
                paid_at=datetime.now(timezone.utc) - timedelta(days=i)
            )
            dashboard_service.db.add(order)
            orders.append(order)
        
        dashboard_service.db.commit()
        
        return {
            "users": users,
            "plan": plan,
            "orders": orders
        }

    def test_get_total_users(self, dashboard_service, test_data):
        """测试获取总用户数"""
        total = dashboard_service.get_total_users()
        assert total >= 5

    def test_get_total_orders(self, dashboard_service, test_data):
        """测试获取总订单数"""
        total = dashboard_service.get_total_orders()
        assert total >= 3

    def test_get_total_revenue(self, dashboard_service, test_data):
        """测试获取总收入"""
        revenue = dashboard_service.get_total_revenue()
        assert revenue >= 99.99 * 3

    def test_get_recent_orders(self, dashboard_service, test_data):
        """测试获取最近订单"""
        orders = dashboard_service.get_recent_orders(limit=10)
        assert len(orders) >= 3
        assert all(hasattr(o, 'paid_at') for o in orders)

    def test_get_user_growth(self, dashboard_service, test_data):
        """测试获取用户增长统计"""
        growth = dashboard_service.get_user_growth(days=7)
        assert isinstance(growth, list)
        assert len(growth) == 7

    def test_get_revenue_by_day(self, dashboard_service, test_data):
        """测试获取每日收入统计"""
        revenue = dashboard_service.get_revenue_by_day(days=7)
        assert isinstance(revenue, list)
        assert len(revenue) == 7

    def test_get_dashboard_summary(self, dashboard_service, test_data):
        """测试获取仪表盘摘要"""
        summary = dashboard_service.get_dashboard_summary()
        
        assert "total_users" in summary
        assert "total_orders" in summary
        assert "total_revenue" in summary
        assert "recent_orders" in summary
        
        assert summary["total_users"] >= 5
        assert summary["total_orders"] >= 3
        assert summary["total_revenue"] >= 99.99 * 3