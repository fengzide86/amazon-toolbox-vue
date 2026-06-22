"""
套餐服务测试
"""
import pytest
from datetime import datetime, timedelta, timezone
from services.plan_service import PlanService
from models import Plan
from database import async_session_maker as SessionLocal


class TestPlanService:
    """套餐服务测试"""

    @pytest.fixture
    def plan_service(self):
        """创建套餐服务实例"""
        db = SessionLocal()
        try:
            yield PlanService(db)
        finally:
            db.close()

    def test_create_plan(self, plan_service):
        """测试创建套餐"""
        plan = plan_service.create_plan(
            name="Test Plan",
            price=99.99,
            duration_days=30,
            features=["feature1", "feature2"]
        )
        
        assert plan is not None
        assert plan.name == "Test Plan"
        assert plan.price == 99.99
        assert plan.duration_days == 30

    def test_get_plan_by_id(self, plan_service):
        """测试根据ID获取套餐"""
        plan = plan_service.create_plan(
            name="Test Plan",
            price=99.99,
            duration_days=30
        )
        
        retrieved_plan = plan_service.get_plan_by_id(plan.id)
        assert retrieved_plan is not None
        assert retrieved_plan.id == plan.id
        assert retrieved_plan.name == "Test Plan"

    def test_get_all_plans(self, plan_service):
        """测试获取所有套餐"""
        for i in range(3):
            plan_service.create_plan(
                name=f"Plan {i}",
                price=99.99 + i,
                duration_days=30
            )
        
        plans = plan_service.get_all_plans()
        assert len(plans) >= 3

    def test_update_plan(self, plan_service):
        """测试更新套餐"""
        plan = plan_service.create_plan(
            name="Original Plan",
            price=99.99,
            duration_days=30
        )
        
        updated_plan = plan_service.update_plan(
            plan.id,
            name="Updated Plan",
            price=199.99
        )
        
        assert updated_plan.name == "Updated Plan"
        assert updated_plan.price == 199.99

    def test_delete_plan(self, plan_service):
        """测试删除套餐"""
        plan = plan_service.create_plan(
            name="Delete Plan",
            price=99.99,
            duration_days=30
        )
        
        result = plan_service.delete_plan(plan.id)
        assert result is True
        
        deleted_plan = plan_service.get_plan_by_id(plan.id)
        assert deleted_plan is None

    def test_get_active_plans(self, plan_service):
        """测试获取激活的套餐"""
        plan1 = plan_service.create_plan(
            name="Active Plan",
            price=99.99,
            duration_days=30,
            is_active=True
        )
        plan2 = plan_service.create_plan(
            name="Inactive Plan",
            price=199.99,
            duration_days=60,
            is_active=False
        )
        
        active_plans = plan_service.get_active_plans()
        assert len(active_plans) >= 1
        assert all(p.is_active for p in active_plans)

    def test_calculate_expire_date(self, plan_service):
        """测试计算过期日期"""
        plan = plan_service.create_plan(
            name="Test Plan",
            price=99.99,
            duration_days=30
        )
        
        start_date = datetime.now(timezone.utc)
        expire_date = plan_service.calculate_expire_date(plan.id, start_date)
        
        expected_expire = start_date + timedelta(days=30)
        assert expire_date == expected_expire

    def test_get_plan_features(self, plan_service):
        """测试获取套餐特性"""
        plan = plan_service.create_plan(
            name="Feature Plan",
            price=99.99,
            duration_days=30,
            features=["feature1", "feature2", "feature3"]
        )
        
        features = plan_service.get_plan_features(plan.id)
        assert len(features) == 3
        assert "feature1" in features
        assert "feature2" in features
        assert "feature3" in features