from decimal import Decimal

import pytest

from models import AuthCode, Plan, StaffRole


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
async def test_plan_state_machine_and_active_edit_guard(client, auth_headers):
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
    commercial_update = await client.patch(
        f"/api/plans/{plan_id}",
        headers=auth_headers,
        json={"price": "120.00"},
    )
    assert commercial_update.status_code == 409

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
