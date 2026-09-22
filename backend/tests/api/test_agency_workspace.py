"""Partner isolation through real JWTs, paid delivery and owner-only assignment."""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import hash_password
from models import Agency, AuthCode, Plan, ProfitRecord, StaffUser
from services.staff_service import create_staff_access_token


@pytest.fixture
async def agency_setup(db_session: AsyncSession, auth_headers: dict) -> dict:
    agencies = [Agency(name="甲代理"), Agency(name="乙代理")]
    db_session.add_all(agencies)
    await db_session.flush()
    staff = [StaffUser(username=f"partner{index}", display_name=f"代理{index}", password_hash=hash_password("Test-partner-123"), role="agent", agency_id=agency.id, token_version=1, status="active", force_password_reset=False) for index, agency in enumerate(agencies)]
    plan = Plan(name="代理测试套餐", price=Decimal("99.00"), duration_days=30, status="active", product_type="consumer", entitlements='{"max_devices":2,"seat_limit":2}')
    db_session.add_all([*staff, plan])
    await db_session.commit()
    return {"owner": auth_headers, "a": {"Authorization": f"Bearer {create_staff_access_token(staff[0])}"}, "b": {"Authorization": f"Bearer {create_staff_access_token(staff[1])}"}, "agencies": agencies, "staff": staff, "plan": plan}


async def customer_and_order(client: AsyncClient, setup: dict, which: str = "a") -> tuple[dict, dict]:
    response = await client.post("/api/agency/customers", headers=setup[which], json={"name": f"{which}的参赛学生", "contact": "测试联系资料"})
    assert response.status_code == 201
    customer = response.json()["data"]
    response = await client.post("/api/agency/orders", headers=setup[which], json={"customer_id": customer["id"], "plan_id": setup["plan"].id, "platform_key": "amazon"})
    assert response.status_code == 201
    return customer, response.json()["data"]


async def test_partner_delivery_requires_owner_payment_and_is_idempotent(client: AsyncClient, agency_setup: dict, db_session: AsyncSession) -> None:
    setup = agency_setup
    customer, order = await customer_and_order(client, setup)
    assert order["status"] == "pending" and order["auth_code"] is None
    order_id = order["id"]
    path = f"/api/agency/orders/{order_id}"
    assert (await client.post(f"{path}/deliver", headers=setup["owner"])).status_code == 409
    assert (await client.post(f"{path}/mark-paid", headers=setup["a"])).status_code == 403
    assert (await client.post(f"{path}/deliver", headers=setup["a"])).status_code == 403
    for _ in range(2):
        response = await client.post(f"{path}/mark-paid", headers=setup["owner"])
        assert response.status_code == 200
    first = (await client.post(f"{path}/deliver", headers=setup["owner"])).json()["data"]
    second = (await client.post(f"{path}/deliver", headers=setup["owner"])).json()["data"]
    assert first["auth_code"]["id"] == second["auth_code"]["id"]
    assert first["auth_code"]["customer_id"] == customer["id"]
    assert (await db_session.execute(select(func.count(AuthCode.id)))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(ProfitRecord.id)))).scalar_one() == 1
    assert (await client.get("/api/agency/orders?status=delivered", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/orders?status=paid", headers=setup["a"])).json()["total"] == 0


async def test_owner_action_center_delivery_tasks_match_filtered_records(client: AsyncClient, agency_setup: dict, staff_headers_factory) -> None:
    setup = agency_setup
    _, pending = await customer_and_order(client, setup)
    _, paid = await customer_and_order(client, setup)
    customer, delivered = await customer_and_order(client, setup)
    _, refunded = await customer_and_order(client, setup)
    for order in (paid, delivered, refunded):
        assert (await client.post(f"/api/agency/orders/{order['id']}/mark-paid", headers=setup["owner"])).status_code == 200
    for order in (delivered, refunded):
        assert (await client.post(f"/api/agency/orders/{order['id']}/deliver", headers=setup["owner"])).status_code == 200
    assert (await client.post(f"/api/orders/{refunded['id']}/refund", headers=setup["owner"], json={"reason": "已在线下退款"})).status_code == 200
    await client.post("/api/agency/requests", headers=setup["a"], json={"customer_id": customer["id"], "kind": "support", "content": "需要安装支持"})
    response = await client.get("/api/admin/action-center", headers=setup["owner"])
    assert response.status_code == 200, response.text
    tasks = response.json()["data"]["agency_delivery_tasks"]
    assert {task["key"]: task["count"] for task in tasks} == {"pending_orders": 1, "paid_orders": 1, "pending_activation": 1, "open_requests": 1}
    for task in tasks:
        target = await client.get(f"/api/agency/{task['section']}?status={task['status']}", headers=setup["owner"])
        assert target.json()["total"] == task["count"]
    for role in ("operator", "support"):
        headers = await staff_headers_factory(role, f"delivery-{role}")
        response = await client.get("/api/admin/action-center", headers=headers)
        assert response.status_code == 200
        assert response.json()["data"]["agency_delivery_tasks"] == []


async def test_partner_customer_order_license_request_and_export_are_scoped(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    customer_a, order_a = await customer_and_order(client, setup)
    customer_b, order_b = await customer_and_order(client, setup, "b")
    await client.post(f"/api/agency/orders/{order_a['id']}/mark-paid", headers=setup["owner"])
    delivered = (await client.post(f"/api/agency/orders/{order_a['id']}/deliver", headers=setup["owner"])).json()["data"]
    request = (await client.post("/api/agency/requests", headers=setup["a"], json={"customer_id": customer_a["id"], "order_id": order_a["id"], "kind": "support", "content": "安装需要支持"})).json()["data"]
    for path in (f"customers/{customer_a['id']}", f"orders/{order_a['id']}", f"licenses/{delivered['auth_code']['id']}", f"requests/{request['id']}"):
        assert (await client.get(f"/api/agency/{path}", headers=setup["b"])).status_code == 404
    assert (await client.patch(f"/api/agency/customers/{customer_a['id']}", headers=setup["b"], json={"name": "越权"})).status_code == 404
    assert (await client.post("/api/agency/orders", headers=setup["a"], json={"customer_id": customer_b["id"], "plan_id": setup["plan"].id, "platform_key": "amazon"})).status_code == 404
    for collection in ("customers", "orders", "licenses", "requests"):
        response = await client.get(f"/api/agency/{collection}", headers=setup["a"])
        assert response.json()["total"] == 1
        assert all(item["agency_id"] == setup["agencies"][0].id for item in response.json()["data"])
    other_agency = setup["agencies"][1].id
    for path in ("summary", "customers", "orders", "licenses", "requests", "orders/export"):
        assert (await client.get(f"/api/agency/{path}?agency_id={other_agency}", headers=setup["a"])).status_code == 403
    csv_response = await client.get("/api/agency/orders/export", headers=setup["a"])
    assert csv_response.status_code == 200
    assert order_a["order_no"] in csv_response.text and order_b["order_no"] not in csv_response.text
    assert (await client.get(f"/api/agency/orders?customer_id={customer_b['id']}", headers=setup["a"])).json()["total"] == 0


@pytest.mark.parametrize("path", [
    "/api/dashboard", "/api/orders", "/api/orders/export", "/api/users", "/api/auth-codes",
    "/api/expenses", "/api/profit", "/api/settings", "/api/staff/accounts", "/api/admin/action-center",
    "/api/feedback", "/api/logs", "/api/ai-chat/admin/config", "/api/auth/me", "/api/devices",
])
async def test_agent_cannot_use_internal_or_customer_identity_routes(client: AsyncClient, agency_setup: dict, path: str) -> None:
    response = await client.get(path, headers=agency_setup["a"])
    assert response.status_code == 403


async def test_owner_reassignment_moves_entire_chain_and_preserves_customer_license(client: AsyncClient, agency_setup: dict, db_session: AsyncSession) -> None:
    setup = agency_setup
    customer, order = await customer_and_order(client, setup)
    await client.post(f"/api/agency/orders/{order['id']}/mark-paid", headers=setup["owner"])
    delivered = (await client.post(f"/api/agency/orders/{order['id']}/deliver", headers=setup["owner"])).json()["data"]
    await client.post("/api/agency/requests", headers=setup["a"], json={"customer_id": customer["id"], "kind": "support", "content": "安装支持"})
    transfer = {"agency_id": setup["agencies"][1].id}
    assert (await client.patch(f"/api/agency/customers/{customer['id']}", headers=setup["a"], json=transfer)).status_code == 403
    assert (await client.patch(f"/api/agency/customers/{customer['id']}", headers=setup["owner"], json=transfer)).status_code == 200
    for collection in ("customers", "orders", "licenses", "requests"):
        assert (await client.get(f"/api/agency/{collection}", headers=setup["a"])).json()["total"] == 0
        assert (await client.get(f"/api/agency/{collection}", headers=setup["b"])).json()["total"] == 1
    assert (await client.patch(f"/api/agency/agencies/{setup['agencies'][1].id}", headers=setup["owner"], json={"status": "disabled"})).status_code == 200
    assert (await client.get("/api/agency/summary", headers=setup["b"])).status_code == 403
    code = await db_session.get(AuthCode, delivered["auth_code"]["id"])
    assert code.status == "unused"
    response = await client.post("/api/auth/verify", json={"code": code.code, "device_id": "isolated-customer-device", "device_name": "测试设备"})
    assert response.status_code == 200 and response.json()["success"]


async def test_staff_agent_requires_agency_and_cannot_change_scope(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    base = {"username": "newpartner", "display_name": "新代理", "password": "New-partner-123", "role": "agent"}
    assert (await client.post("/api/staff/accounts", headers=setup["owner"], json=base)).status_code == 422
    response = await client.post("/api/staff/accounts", headers=setup["owner"], json={**base, "agency_id": setup["agencies"][0].id})
    assert response.status_code == 201
    assert response.json()["data"]["agency_id"] == setup["agencies"][0].id
    assert (await client.get("/api/staff/auth/me", headers=setup["a"])).json()["data"]["agency_id"] == setup["agencies"][0].id
    assert (await client.post("/api/agency/agencies", headers=setup["a"], json={"name": "非法代理"})).status_code == 403


async def test_request_ownership_and_owner_reply_do_not_automatically_refund(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    customer, order = await customer_and_order(client, setup)
    _, other_order = await customer_and_order(client, setup)
    payload = {"customer_id": customer["id"], "order_id": other_order["id"], "kind": "refund", "content": "申请退款"}
    assert (await client.post("/api/agency/requests", headers=setup["a"], json=payload)).status_code == 422
    payload["order_id"] = order["id"]
    response = await client.post("/api/agency/requests", headers=setup["a"], json=payload)
    assert response.status_code == 201
    item_id = response.json()["data"]["id"]
    reply = {"status": "rejected", "response": "该订单未支付，无需退款。"}
    assert (await client.patch(f"/api/agency/requests/{item_id}", headers=setup["a"], json=reply)).status_code == 403
    assert (await client.patch(f"/api/agency/requests/{item_id}", headers=setup["owner"], json=reply)).status_code == 200
    assert (await client.get(f"/api/agency/orders/{order['id']}", headers=setup["a"])).json()["data"]["status"] == "pending"


async def test_operator_cannot_approve_agency_order_through_legacy_endpoint(client: AsyncClient, agency_setup: dict, staff_headers_factory) -> None:
    _, order = await customer_and_order(client, agency_setup)
    operator = await staff_headers_factory("operator", "internaloperator")
    response = await client.post(f"/api/orders/{order['id']}/mark-paid", headers=operator)
    assert response.status_code == 403


async def test_partner_lists_paginate_and_do_not_claim_legacy_orders(client: AsyncClient, agency_setup: dict, db_session: AsyncSession) -> None:
    from models import Order

    for _ in range(3):
        await customer_and_order(client, agency_setup)
    db_session.add(Order(order_no="LEGACY-UNASSIGNED", amount=Decimal("99"), status="pending"))
    await db_session.commit()
    first = (await client.get("/api/agency/orders?page_size=2", headers=agency_setup["owner"])).json()
    second = (await client.get("/api/agency/orders?page_size=2&page=2", headers=agency_setup["owner"])).json()
    assert first["total"] == 3 and first["total_pages"] == 2
    assert len(first["data"]) == 2 and len(second["data"]) == 1
    assert not ({r["id"] for r in first["data"]} & {r["id"] for r in second["data"]})


async def test_owner_agency_configuration_search_and_wire_timestamps(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    response = await client.post("/api/agency/agencies", headers=setup["owner"], json={"name": "第三代理", "contact": "测试联系人", "notes": "合作测试"})
    assert response.status_code == 201
    agency = response.json()["data"]
    assert agency["created_at"].endswith("+00:00")
    assert (await client.get("/api/agency/agencies?page_size=1", headers=setup["owner"])).json()["total"] == 3
    assert (await client.get("/api/agency/plans", headers=setup["a"])).json()["data"][0]["id"] == setup["plan"].id
    assert (await client.patch(f"/api/agency/agencies/{agency['id']}", headers=setup["owner"], json={"name": "新名称", "status": "disabled"})).status_code == 200
    assert (await client.get("/api/agency/agencies?q=新名称&status=disabled", headers=setup["owner"])).json()["total"] == 1
    assert (await client.get("/api/agency/agencies?q=新名称&status=active", headers=setup["owner"])).json()["total"] == 0
    assert (await client.patch(f"/api/agency/agencies/{agency['id']}", headers=setup["owner"], json={"name": None})).status_code == 422
    assert (await client.post("/api/agency/customers", headers=setup["owner"], json={"name": "无人归属"})).status_code == 422
    assert (await client.post("/api/agency/customers", headers=setup["a"], json={"name": "越权", "agency_id": setup["agencies"][1].id})).status_code == 403
    customer, order = await customer_and_order(client, setup)
    assert (await client.get(f"/api/agency/customers/{customer['id']}", headers=setup["a"])).status_code == 200
    assert (await client.get("/api/agency/customers?q=参赛", headers=setup["a"])).json()["total"] == 1
    assert (await client.get(f"/api/agency/orders?q={order['order_no']}", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/orders?q=没有这个客户", headers=setup["a"])).json()["total"] == 0
    assert (await client.get("/api/agency/summary", headers=setup["a"])).json()["data"]["pending_orders"] == 1
    assert (await client.patch(f"/api/agency/customers/{customer['id']}", headers=setup["a"], json={"name": "更名客户", "notes": "更新备注"})).status_code == 200
    assert (await client.patch(f"/api/agency/customers/{customer['id']}", headers=setup["owner"], json={"agency_id": None})).status_code == 422
    assert (await client.post("/api/agency/orders", headers=setup["a"], json={"customer_id": customer["id"], "plan_id": 999999, "platform_key": "amazon"})).status_code == 422


async def test_agent_staff_disabled_scope_and_customer_token_collision_never_fall_through(client: AsyncClient, agency_setup: dict, db_session: AsyncSession) -> None:
    from models import User

    setup = agency_setup
    # Staff ids and customer ids live in distinct tables; a revoked staff token must never resolve as User.
    db_session.add(User(id=setup["staff"][0].id, name="碰巧同ID客户", is_active=True))
    await db_session.commit()
    staff = setup["staff"][0]
    staff.status = "disabled"
    await db_session.commit()
    assert (await client.get("/api/auth/me", headers=setup["a"])).status_code == 401
    assert (await client.get("/api/agency/summary", headers=setup["a"])).status_code == 401


async def test_agency_request_reads_filters_reopen_and_validation(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    customer, order = await customer_and_order(client, setup)
    assert (await client.post("/api/agency/requests", headers=setup["a"], json={"customer_id": customer["id"], "kind": "refund", "content": "退款"})).status_code == 422
    item = (await client.post("/api/agency/requests", headers=setup["a"], json={"customer_id": customer["id"], "order_id": order["id"], "kind": "extension", "content": "延期评估"})).json()["data"]
    assert (await client.get(f"/api/agency/requests/{item['id']}", headers=setup["a"])).status_code == 200
    assert (await client.patch(f"/api/agency/requests/{item['id']}", headers=setup["owner"], json={"status": "resolved", "response": "已说明处理方式"})).status_code == 200
    assert (await client.get("/api/agency/requests?status=resolved", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/requests?q=延期", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/requests?q=不存在", headers=setup["a"])).json()["total"] == 0
    assert (await client.patch(f"/api/agency/requests/{item['id']}", headers=setup["owner"], json={"status": "open", "response": "重新受理"})).json()["data"]["resolved_at"] is None
    await client.post(f"/api/agency/orders/{order['id']}/mark-paid", headers=setup["owner"])
    delivered = (await client.post(f"/api/agency/orders/{order['id']}/deliver", headers=setup["owner"])).json()["data"]
    assert (await client.get(f"/api/agency/licenses/{delivered['auth_code']['id']}", headers=setup["a"])).status_code == 200
    assert (await client.get("/api/agency/licenses?status=unused", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/licenses?q=参赛", headers=setup["a"])).json()["total"] == 1
    assert (await client.get("/api/agency/licenses?q=不存在", headers=setup["a"])).json()["total"] == 0


async def test_refund_keeps_delivery_history_but_removes_order_from_current_delivered_count(client: AsyncClient, agency_setup: dict) -> None:
    setup = agency_setup
    _, order = await customer_and_order(client, setup)
    await client.post(f"/api/agency/orders/{order['id']}/mark-paid", headers=setup["owner"])
    await client.post(f"/api/agency/orders/{order['id']}/deliver", headers=setup["owner"])
    assert (await client.get("/api/agency/summary", headers=setup["a"])).json()["data"]["delivered_orders"] == 1
    response = await client.post(f"/api/orders/{order['id']}/refund", headers=setup["owner"], json={"reason": "退款验收"})
    assert response.status_code == 200
    assert (await client.get("/api/agency/orders?status=delivered", headers=setup["a"])).json()["total"] == 0
    assert (await client.get("/api/agency/summary", headers=setup["a"])).json()["data"]["delivered_orders"] == 0
    assert (await client.get("/api/agency/licenses", headers=setup["a"])).json()["total"] == 1


async def test_delivery_rechecks_customer_order_agency_after_locking(client: AsyncClient, agency_setup: dict, db_session: AsyncSession) -> None:
    from models import Order

    setup = agency_setup
    _, order = await customer_and_order(client, setup)
    await client.post(f"/api/agency/orders/{order['id']}/mark-paid", headers=setup["owner"])
    broken = await db_session.get(Order, order["id"])
    broken.agency_id = setup["agencies"][1].id
    await db_session.commit()
    assert (await client.post(f"/api/agency/orders/{order['id']}/deliver", headers=setup["owner"])).status_code == 409
    assert (await db_session.execute(select(func.count(AuthCode.id)))).scalar_one() == 0
