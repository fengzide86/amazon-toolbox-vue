"""套餐服务当前异步契约测试。"""
import pytest
from starlette.requests import Request

from core.exceptions import ConflictException, NotFoundException
from models import Plan, PlanStatus
from services.plan_service import PlanService

ACTOR = {"staff_id": 1, "username": "owner", "role": "super_admin"}


def request(method: str = "POST") -> Request:
    return Request({
        "type": "http",
        "method": method,
        "path": "/api/plans",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("test", 80),
        "scheme": "http",
        "query_string": b"",
    })


@pytest.mark.asyncio
class TestPlanService:
    async def test_create_plan(self, db_session):
        service = PlanService(db_session)
        result = await service.create({
            "name": "Y199 冲刺包",
            "price": 199.00,
            "duration_days": 5,
            "features": '{"benefits":["完整工具"],"allowed_tools":["listing"]}',
        }, ACTOR, request())

        assert result["success"] is True
        assert result["data"]["status"] == PlanStatus.DISABLED
        assert result["data"]["name"] == "Y199 冲刺包"
        assert result["data"]["plan_code"] == "Y199"
        assert result["data"]["benefits"] == ["完整工具"]
        assert result["data"]["allowed_tools"] == ["listing"]

    async def test_create_duplicate_plan(self, db_session):
        service = PlanService(db_session)
        payload = {"name": "重复套餐", "price": 99, "duration_days": 7}
        await service.create(payload, ACTOR, request())
        with pytest.raises(ConflictException, match="已存在"):
            await service.create(payload, ACTOR, request())

    async def test_public_list_excludes_archived(self, db_session):
        db_session.add_all([
            Plan(name="Y15 体验卡", price=15, duration_days=1, status="active"),
            Plan(name="已归档", price=1, duration_days=1, status="archived"),
        ])
        await db_session.commit()
        result = await PlanService(db_session).list_public()

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
        result = await PlanService(db_session).list_public()

        plan = result["data"][0]
        assert plan["plan_code"] == "Y49"
        assert plan["benefits"] == ["物流模板", "新手工具"]
        assert plan["allowed_tools"] == []

    async def test_update_plan(self, db_session):
        plan = Plan(name="原套餐", price=99, duration_days=30, status="disabled")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).update(
            plan.id,
            {"name": "更新套餐", "price": 149},
            ACTOR,
            request("PATCH"),
        )

        assert result["success"] is True
        assert result["data"]["name"] == "更新套餐"
        assert result["data"]["price"] == 149.0

    async def test_get_plan_by_id(self, db_session):
        plan = Plan(name="Y999 全程陪跑包", price=999, duration_days=90, status="active")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).get_public(plan.id)

        assert result["success"] is True
        assert result["data"]["display_badge"] == "全程服务"
        assert "updated_at" in result["data"]

    async def test_archive_plan_is_terminal_state(self, db_session):
        plan = Plan(name="待归档套餐", price=99, duration_days=30, status="disabled")
        db_session.add(plan)
        await db_session.commit()
        result = await PlanService(db_session).transition(
            plan.id,
            "archive",
            ACTOR,
            request(),
        )
        await db_session.refresh(plan)

        assert result["success"] is True
        assert plan.status == PlanStatus.ARCHIVED

    async def test_missing_plan_returns_error(self, db_session):
        with pytest.raises(NotFoundException, match="不存在"):
            await PlanService(db_session).get_public(99999)
