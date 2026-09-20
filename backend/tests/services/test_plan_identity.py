import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from domains.access import fixed_plan_entitlements, resolve_plan_code
from domains.catalog import seed_service
from models import Plan


@pytest.mark.parametrize(("name", "entitlements", "expected"), [
    ("Y49 旧套餐", None, "Y49"),
    ("y199 旧套餐", "{}", "Y199"),
    ("自定义套餐", {}, None),
    ("Y49 旧套餐", "broken", "Y49"),
    ("Y49 旧套餐", "[]", "Y49"),
    ("新的展示名", {"plan_code": "Y49"}, "Y49"),
    ("Y199 改名不能升级", {"plan_code": "Y49"}, "Y49"),
    ("Y199 无权限", {"plan_code": None}, None),
    ("Y199 损坏数据", {"plan_code": 199}, None),
    ("Y199 损坏数据", {"plan_code": "Y49extra"}, None),
    ("Y199 损坏数据", {"plan_code": "y49"}, None),
])
def test_single_identity_resolver_only_falls_back_for_legacy_rows(name, entitlements, expected):
    assert resolve_plan_code(name, entitlements) == expected


def test_freeze_preserves_other_entitlements_and_pins_unknown_identity():
    original = {"max_batch_rows": 23, "future_flag": "kept"}
    fixed = fixed_plan_entitlements("自定义套餐", original)
    assert fixed == {**original, "plan_code": None}
    assert "plan_code" not in original
    assert resolve_plan_code("Y199 仿冒名称", fixed) is None


@pytest.mark.asyncio
async def test_bootstrap_pins_legacy_plans_once_and_does_not_rewrite_pinned_rights(db_session, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db_session

    monkeypatch.setattr(seed_service, "async_session_maker", sessions)
    monkeypatch.setattr(seed_service, "migrate_legacy_admin_password", AsyncMock())
    monkeypatch.setattr(seed_service, "_seed_internal_validation_data", AsyncMock())
    legacy = Plan(name="Y999 全程陪跑包", price=999, duration_days=90, status="active")
    custom = Plan(name="自定义原名", price=99, duration_days=30, status="active")
    db_session.add_all([legacy, custom])
    await db_session.commit()
    await seed_service.seed_initial_data()
    await db_session.refresh(legacy)
    await db_session.refresh(custom)
    assert json.loads(legacy.entitlements)["plan_code"] == "Y999"
    assert legacy.product_type == "business"
    assert json.loads(custom.entitlements)["plan_code"] is None

    legacy.name = "稳定的专业套餐"
    legacy.entitlements = json.dumps({**json.loads(legacy.entitlements), "max_batch_rows": 12})
    custom.name = "Y999 全程陪跑包"
    await db_session.commit()
    await seed_service.seed_initial_data()
    await db_session.refresh(legacy)
    await db_session.refresh(custom)
    assert json.loads(legacy.entitlements)["max_batch_rows"] == 12
    assert custom.product_type == "consumer"
    assert json.loads(custom.entitlements) == {"plan_code": None}


@pytest.mark.asyncio
async def test_default_seed_plans_have_fixed_identities(db_session, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db_session

    monkeypatch.setattr(seed_service, "async_session_maker", sessions)
    monkeypatch.setattr(seed_service, "migrate_legacy_admin_password", AsyncMock())
    monkeypatch.setattr(seed_service, "_seed_internal_validation_data", AsyncMock())
    await seed_service.seed_initial_data()
    plans = (await db_session.execute(select(Plan))).scalars().all()
    assert {json.loads(plan.entitlements)["plan_code"] for plan in plans} == {"Y15", "Y49", "Y199", "Y999"}
