"""套餐服务当前异步契约测试。"""
import pytest

from models import Plan
from services.plan_service import PlanService


@pytest.mark.asyncio
class TestPlanService:
    async def test_create_plan(self, db_session):
        service = PlanService(db_session)
        result = await service.create_plan({
            "name": "Y199 冲刺包",
            "price": 199.00,
            "duration_days": 5,
            "features": '{"benefits":["完整工具"],"allowed_tools":["listing"]}',
        })

        assert result["success"] is True
        assert result["data"]["name"] == "Y199 冲刺包"
        assert result["data"]["plan_code"] == "Y199"
        assert result["data"]["benefits"] == ["完整工具"]
        assert result["data"]["allowed_tools"] == ["listing"]

    async def test_create_duplicate_plan(self, db_session):
        service = PlanService(db_session)
        payload = {"name": "重复套餐", "price": 99, "duration_days": 7}
        await service.create_plan(payload)
        duplicate = await service.create_plan(payload)

        assert duplicate["success"] is False
        assert "已存在" in duplicate["message"]

    async def test_get_plans_list_excludes_deleted(self, db_session):
        db_session.add_all([
            Plan(name="Y15 体验卡", price=15, duration_days=1, status="active"),
            Plan(name="已删除", price=0, duration_days=1, status="deleted"),
        ])
        await db_session.commit()
        result = await PlanService(db_session).get_plans_list()

        assert result["success"] is True
        assert [plan["name"] for plan in result["data"]] == ["Y15 体验卡"]

    async def test_serialize_legacy_feature_text(self, db_session):
        db_session.add(Plan(
            name="Y49 开局提速卡",
            price=49,
            duration_days=7,
            status="active",
            features="物流模板+新手工具",
        ))
        await db_session.commit()
        result = await PlanService(db_session).get_plans_list(status="active")

        plan = result["data"][0]
        assert plan["plan_code"] == "Y49"
        assert plan["benefits"] == ["物流模板", "新手工具"]
        assert plan["allowed_tools"] == []

    async def test_update_plan(self, db_session):
        plan = Plan(name="原套餐", price=99, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).update_plan(plan.id, {"name": "更新套餐", "price": 149})

        assert result["success"] is True
        assert result["data"]["name"] == "更新套餐"
        assert result["data"]["price"] == 149.0

    async def test_get_plan_by_id(self, db_session):
        plan = Plan(name="Y999 全程陪跑包", price=999, duration_days=90, status="active")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).get_plan_by_id(plan.id)

        assert result["success"] is True
        assert result["data"]["display_badge"] == "全程服务"
        assert "updated_at" in result["data"]

    async def test_delete_plan_soft_deletes(self, db_session):
        plan = Plan(name="待删除套餐", price=99, duration_days=30, status="active")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).delete_plan(plan.id)
        await db_session.refresh(plan)

        assert result["success"] is True
        assert plan.status == "deleted"

    async def test_missing_plan_returns_error(self, db_session):
        result = await PlanService(db_session).get_plan_by_id(99999)
        assert result["success"] is False
        assert "不存在" in result["message"]
