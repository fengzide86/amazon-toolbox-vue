"""
订单服务测试
"""
import pytest
from datetime import datetime, timedelta
from services.order_service import OrderService
from models import Order, User, Plan
from database import async_session_maker as SessionLocal


class TestOrderService:
    """订单服务测试"""

    @pytest.fixture
    def order_service(self):
        """创建订单服务实例"""
        db = SessionLocal()
        try:
            yield OrderService(db)
        finally:
            db.close()

    @pytest.fixture
    def test_user(self, order_service):
        """创建测试用户"""
        user = User(
            username="test_user",
            email="test@example.com",
            hashed_password="hashed_password",
            role="user"
        )
        order_service.db.add(user)
        order_service.db.commit()
        order_service.db.refresh(user)
        return user

    @pytest.fixture
    def test_plan(self, order_service):
        """创建测试套餐"""
        plan = Plan(
            name="Test Plan",
            price=99.99,
            duration_days=30,
            features=["feature1", "feature2"]
        )
        order_service.db.add(plan)
        order_service.db.commit()
        order_service.db.refresh(plan)
        return plan

    def test_create_order(self, order_service, test_user, test_plan):
        """测试创建订单"""
        order = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        
        assert order is not None
        assert order.user_id == test_user.id
        assert order.plan_id == test_plan.id
        assert order.amount == test_plan.price
        assert order.status == "pending"

    def test_get_order_by_id(self, order_service, test_user, test_plan):
        """测试根据ID获取订单"""
        order = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        
        retrieved_order = order_service.get_order_by_id(order.id)
        assert retrieved_order is not None
        assert retrieved_order.id == order.id

    def test_get_user_orders(self, order_service, test_user, test_plan):
        """测试获取用户订单列表"""
        order1 = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        order2 = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        
        orders = order_service.get_user_orders(test_user.id)
        assert len(orders) == 2
        assert orders[0].id in [order1.id, order2.id]
        assert orders[1].id in [order1.id, order2.id]

    def test_update_order_status(self, order_service, test_user, test_plan):
        """测试更新订单状态"""
        order = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        
        updated_order = order_service.update_order_status(
            order.id,
            status="paid",
            payment_method="alipay"
        )
        
        assert updated_order.status == "paid"
        assert updated_order.payment_method == "alipay"
        assert updated_order.paid_at is not None

    def test_cancel_order(self, order_service, test_user, test_plan):
        """测试取消订单"""
        order = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        
        cancelled_order = order_service.cancel_order(order.id)
        assert cancelled_order.status == "cancelled"
        assert cancelled_order.cancelled_at is not None

    def test_get_pending_orders(self, order_service, test_user, test_plan):
        """测试获取待支付订单"""
        order1 = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        order2 = order_service.create_order(
            user_id=test_user.id,
            plan_id=test_plan.id,
            amount=test_plan.price
        )
        order_service.update_order_status(order2.id, status="paid")
        
        pending_orders = order_service.get_pending_orders()
        assert len(pending_orders) == 1
        assert pending_orders[0].id == order1.id

    def test_get_order_statistics(self, order_service, test_user, test_plan):
        """测试获取订单统计"""
        for i in range(5):
            order_service.create_order(
                user_id=test_user.id,
                plan_id=test_plan.id,
                amount=test_plan.price
            )
        
        stats = order_service.get_order_statistics()
        assert stats["total_orders"] == 5
        assert stats["total_amount"] == test_plan.price * 5