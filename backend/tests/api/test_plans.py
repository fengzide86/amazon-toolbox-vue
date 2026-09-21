import json
from decimal import Decimal

import pytest

from models import AuthCode, Plan, StaffRole
from services.entitlement_service import resolve_product_access


def data(response):
    return response.json().get("data", response.json())


@pytest.mark.asyncio
async def test_public_catalog_only_exposes_active_consumer_plans(client, db_session):
    db_session.add_all(
        [
            Plan(name="启用套餐", price=99, duration_days=30, status="active"),
            Plan(name="禁用套餐", price=49, duration_days=7, status="disabled"),
            Plan(name="归档套餐", price=19, duration_days=1, status="archived"),
            Plan(
                name="企业套餐",
                price=999,
                duration_days=90,
                status="active",
                product_type="business",
            ),
        ]
    )
    await db_session.commit()
    response = await client.get("/api/plans")
    assert response.status_code == 200
    assert [item["name"] for item in data(response)] == ["启用套餐"]


@pytest.mark.asyncio
async def test_plan_admin_list_requires_staff(client):
    assert (await client.get("/api/plans/admin")).status_code == 401


@pytest.mark.asyncio
async def test_create_plan_defaults_disabled_and_validates_money(client, auth_headers):
    response = await client.post(
        "/api/plans",
        headers=auth_headers,
        json={"name": "新套餐", "price": "199.00", "duration_days": 60},
    )
    assert response.status_code == 201
    assert data(response)["status"] == "disabled"
    assert (
        await client.post(
            "/api/plans",
            headers=auth_headers,
            json={"name": "无效套餐", "price": 0, "duration_days": 30},
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_only_super_admin_mutates_plans(client, staff_headers_factory):
    operator_headers = await staff_headers_factory(StaffRole.OPERATOR, "plan-operator")
    response = await client.post(
        "/api/plans",
        headers=operator_headers,
        json={"name": "越权套餐", "price": 10, "duration_days": 1},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_plan_state_machine_and_active_price_edit(client, auth_headers):
    created = await client.post(
        "/api/plans",
        headers=auth_headers,
        json={"name": "状态套餐", "price": "100.00", "duration_days": 30},
    )
    plan_id = data(created)["id"]
    enabled = await client.post(f"/api/plans/{plan_id}/enable", headers=auth_headers)
    assert enabled.status_code == 200
    assert data(enabled)["status"] == "active"

    display_update = await client.patch(
        f"/api/plans/{plan_id}",
        headers=auth_headers,
        json={"features": "新的展示说明"},
    )
    assert display_update.status_code == 200
    price_update = await client.patch(
        f"/api/plans/{plan_id}",
        headers=auth_headers,
        json={"price": "120.00"},
    )
    assert price_update.status_code == 200
    assert Decimal(str(data(price_update)["price"])) == Decimal("120.0")

    duration_update = await client.patch(
        f"/api/plans/{plan_id}",
        headers=auth_headers,
        json={"duration_days": 60},
    )
    assert duration_update.status_code == 409

    disabled = await client.post(f"/api/plans/{plan_id}/disable", headers=auth_headers)
    assert data(disabled)["status"] == "disabled"
    updated = await client.patch(
        f"/api/plans/{plan_id}",
        headers=auth_headers,
        json={"price": "120.00"},
    )
    assert updated.status_code == 200
    assert Decimal(str(data(updated)["price"])) == Decimal("120.0")

    archived = await client.post(f"/api/plans/{plan_id}/archive", headers=auth_headers)
    assert data(archived)["status"] == "archived"
    assert (
        await client.post(f"/api/plans/{plan_id}/enable", headers=auth_headers)
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/plans/{plan_id}",
            headers=auth_headers,
            json={"features": "不可修改"},
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_plan_with_usable_codes_cannot_be_archived(client, db_session, auth_headers):
    plan = Plan(name="有关联码套餐", price=100, duration_days=30, status="disabled")
    db_session.add(plan)
    await db_session.flush()
    db_session.add(AuthCode(code="PLAN-CODE-001", plan_id=plan.id, status="unused"))
    await db_session.commit()
    response = await client.post(f"/api/plans/{plan.id}/archive", headers=auth_headers)
    assert response.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["active", "disabled"])
async def test_plan_price_guard_rejects_stale_edits_without_overwriting_fields(
    client, db_session, auth_headers, status,
):
    plan = Plan(name="并发改价套餐", price=199, duration_days=30, status=status, features="原始说明")
    db_session.add(plan)
    await db_session.commit()
    endpoint = f"/api/plans/{plan.id}"

    first = await client.patch(endpoint, headers=auth_headers, json={
        "price": "299.00", "expected_price": "199.00",
    })
    assert first.status_code == 200
    assert data(first)["price"] == 299.0
    assert "expected_price" not in data(first)

    stale = await client.patch(endpoint, headers=auth_headers, json={
        "price": "249.00", "expected_price": "199.00", "features": "不应写入的说明",
    })
    assert stale.status_code == 409
    await db_session.refresh(plan)
    assert plan.price == Decimal("299.00")
    assert plan.features == "原始说明"

    display_only = await client.patch(endpoint, headers=auth_headers, json={"features": "只改说明"})
    assert display_only.status_code == 200
    assert data(display_only)["price"] == 299.0

    refreshed = await client.patch(endpoint, headers=auth_headers, json={
        "price": "249.00", "expected_price": "299.00",
    })
    assert refreshed.status_code == 200
    assert data(refreshed)["price"] == 249.0


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {},
    {"expected_price": "100.00"},
    {"price": "120.00", "expected_price": "0"},
    {"price": "120.00", "expected_price": "100.001"},
    {"price": "120.00", "expected_price": "100000000.00"},
    *({field: None} for field in (
        "name", "price", "expected_price", "duration_days", "sort_order", "product_type",
    )),
])
async def test_plan_patch_rejects_empty_guard_and_explicit_nulls(
    client, db_session, auth_headers, payload,
):
    plan = Plan(name="输入校验套餐", price=100, duration_days=30, status="disabled")
    db_session.add(plan)
    await db_session.commit()
    response = await client.patch(f"/api/plans/{plan.id}", headers=auth_headers, json=payload)
    assert response.status_code == 422
    await db_session.refresh(plan)
    assert plan.name == "输入校验套餐"
    assert plan.price == Decimal("100.00")
    assert plan.duration_days == 30
    assert plan.sort_order == 0
    assert plan.product_type == "consumer"


@pytest.mark.asyncio
async def test_plan_missing_resources_use_404(client, auth_headers):
    response = await client.patch(
        "/api/plans/99999",
        headers=auth_headers,
        json={"name": "不存在"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_plan_customer_entitlements_remain_available(client, db_session):
    plan = Plan(
        name="Y199冲刺包",
        price=199,
        duration_days=5,
        status="active",
        features='{"benefits":["完整自动化工具"],"allowed_tools":["listing"]}',
    )
    db_session.add(plan)
    await db_session.commit()
    item = data(await client.get("/api/plans"))[0]
    assert item["plan_code"] == "Y199"
    assert item["benefits"] == ["完整自动化工具"]
    assert item["allowed_tools"] == ["listing"]


@pytest.mark.asyncio
@pytest.mark.parametrize(("original_name", "expected"), [("Y49 旧名称", "Y49"), ("定制套餐", None)])
async def test_legacy_rename_pins_original_identity_without_granting_new_tools(
    client, db_session, auth_headers, original_name, expected,
):
    plan = Plan(name=original_name, price=49, duration_days=7, status="active", entitlements="{}")
    db_session.add(plan)
    await db_session.commit()
    renamed = await client.patch(f"/api/plans/{plan.id}", headers=auth_headers, json={"name": "Y199 新展示名"})
    assert renamed.status_code == 200
    assert data(renamed)["plan_code"] == expected
    assert data(renamed)["name"] == "Y199 新展示名"
    await db_session.refresh(plan)
    assert json.loads(plan.entitlements)["plan_code"] == expected
    assert data(await client.get(f"/api/plans/{plan.id}"))["plan_code"] == expected


@pytest.mark.asyncio
async def test_legacy_client_create_and_replace_entitlements_preserve_identity(client, db_session, auth_headers):
    created = await client.post("/api/plans", headers=auth_headers, json={
        "name": "Y49 初始套餐", "price": 49, "duration_days": 7, "code_prefix": "OTHER",
    })
    assert created.status_code == 201
    plan_id = data(created)["id"]
    assert data(created)["entitlements"]["plan_code"] == "Y49"
    assert data(created)["plan_code"] == "Y49"
    updated = await client.put(f"/api/plans/{plan_id}", headers=auth_headers, json={
        "name": "新的展示名", "code_prefix": "Y999", "entitlements": {"desktop_notification": False},
    })
    assert updated.status_code == 200
    assert data(updated)["plan_code"] == "Y49"
    assert data(updated)["entitlements"]["desktop_notification"] is False
    cleared = await client.patch(f"/api/plans/{plan_id}", headers=auth_headers, json={"entitlements": None})
    assert cleared.status_code == 200
    assert data(cleared)["entitlements"]["plan_code"] == "Y49"
    for action in ("enable", "disable", "enable"):
        result = await client.post(f"/api/plans/{plan_id}/{action}", headers=auth_headers)
        assert result.status_code == 200
        assert data(result)["plan_code"] == "Y49"


@pytest.mark.asyncio
@pytest.mark.parametrize("override", ["Y199", None, 49, "y49", {"code": "Y49"}])
async def test_plan_identity_cannot_be_overwritten_through_admin_entitlements(
    client, db_session, auth_headers, override,
):
    plan = Plan(name="Y49 旧套餐", price=49, duration_days=7, status="disabled", entitlements="{}")
    db_session.add(plan)
    await db_session.commit()
    response = await client.patch(f"/api/plans/{plan.id}", headers=auth_headers, json={
        "name": "Y199 新展示名", "entitlements": {"plan_code": override},
    })
    assert response.status_code == 422
    await db_session.refresh(plan)
    assert plan.name == "Y49 旧套餐"
    assert "plan_code" not in json.loads(plan.entitlements)


@pytest.mark.asyncio
async def test_custom_plan_cannot_select_an_unrelated_identity_at_create(client, auth_headers):
    rejected = await client.post("/api/plans", headers=auth_headers, json={
        "name": "定制套餐", "price": 99, "duration_days": 30, "entitlements": {"plan_code": "Y199"},
    })
    assert rejected.status_code == 422
    created = await client.post("/api/plans", headers=auth_headers, json={
        "name": "定制套餐", "price": 99, "duration_days": 30, "code_prefix": "Y199",
    })
    assert created.status_code == 201
    assert data(created)["plan_code"] is None
    assert data(created)["entitlements"]["plan_code"] is None
    denied = await client.patch(f"/api/plans/{data(created)['id']}", headers=auth_headers, json={
        "name": "Y199 改名", "entitlements": {"plan_code": "Y199"},
    })
    assert denied.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("product_type", ["consumer", "business"])
async def test_display_rename_does_not_change_c_b_access(client, db_session, auth_headers, product_type):
    plan = Plan(
        name="Y49 原始套餐", price=49, duration_days=7, status="active", product_type=product_type,
        entitlements=json.dumps({"batch_execution": True, "multi_account_workspace": True}),
    )
    db_session.add(plan)
    await db_session.flush()
    code = AuthCode(code=f"IDENTITY-{product_type}", plan_id=plan.id, status="unused")
    db_session.add(code)
    await db_session.commit()
    before = await resolve_product_access(db_session, code.id)
    renamed = await client.patch(f"/api/plans/{plan.id}", headers=auth_headers, json={"name": "Y999 全程陪跑包"})
    assert renamed.status_code == 200
    after = await resolve_product_access(db_session, code.id)
    assert after["product_type"] == before["product_type"] == product_type
    assert after["entitlements"] == before["entitlements"]


@pytest.mark.asyncio
async def test_auth_legacy_contract_retains_stable_code_after_rename(client, db_session, auth_headers):
    plan = Plan(name="Y49 原始套餐", price=49, duration_days=7, status="active")
    db_session.add(plan)
    await db_session.flush()
    db_session.add(AuthCode(code="IDENTITY-LOGIN", plan_id=plan.id, status="unused", max_devices=1))
    await db_session.commit()
    assert (await client.patch(f"/api/plans/{plan.id}", headers=auth_headers, json={"name": "改名后的套餐"})).status_code == 200
    login = await client.post("/api/auth/verify", json={
        "code": "IDENTITY-LOGIN", "device_id": "identity-device", "device_name": "测试设备",
    })
    payload = data(login)
    assert login.status_code == 200 and login.json()["success"] is True
    assert payload["plan_name"] == "改名后的套餐"
    assert payload["plan_code"] == "Y49"
    assert payload["entitlements"]["plan_code"] == "Y49"
    for method, endpoint in (("POST", "/api/auth/check"), ("GET", "/api/auth/me")):
        result = await client.request(method, endpoint, headers={"Authorization": f"Bearer {payload['token']}"})
        assert result.status_code == 200
        assert data(result)["plan_code"] == "Y49"
