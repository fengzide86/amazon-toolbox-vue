import json

import pytest

from models import AuthCode, Plan, Setting
from services.entitlement_service import normalize_entitlements, resolve_product_access


def test_consumer_never_inherits_batch_capability_from_payload():
    result = normalize_entitlements({
        "batch_execution": True,
        "multi_account_workspace": True,
        "max_batch_rows": 5000,
        "max_open_sessions": 99,
    }, "consumer")

    assert result["batch_execution"] is False
    assert result["multi_account_workspace"] is False
    assert result["max_batch_rows"] == 1000
    assert result["max_open_sessions"] == 10


def test_business_limits_are_clamped_and_flags_are_explicit():
    result = normalize_entitlements({
        "batch_execution": True,
        "multi_account_workspace": True,
        "max_batch_rows": 0,
        "max_open_sessions": 1,
    }, "business")

    assert result["batch_execution"] is True
    assert result["multi_account_workspace"] is True
    assert result["max_batch_rows"] == 50
    assert result["max_open_sessions"] == 2


@pytest.mark.asyncio
async def test_product_access_requires_global_switch_and_business_plan(db_session):
    plan = Plan(
        name="专业批量版",
        price=999,
        duration_days=30,
        product_type="business",
        entitlements=json.dumps({"batch_execution": True, "multi_account_workspace": True}),
    )
    db_session.add(plan)
    await db_session.flush()
    code = AuthCode(code="BUSINESS-TEST-001", plan_id=plan.id, seat_limit=20, max_devices=20)
    db_session.add(code)
    setting = Setting(key="business_workspace_enabled", value="false")
    db_session.add(setting)
    await db_session.commit()

    disabled = await resolve_product_access(db_session, code.id)
    assert disabled["product_type"] == "business"
    assert disabled["enabled"] is False

    setting.value = "true"
    await db_session.commit()

    enabled = await resolve_product_access(db_session, code.id)
    assert enabled["enabled"] is True
    assert enabled["entitlements"]["batch_execution"] is True
