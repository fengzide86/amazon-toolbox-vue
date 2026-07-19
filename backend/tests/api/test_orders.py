from decimal import Decimal

import pytest
from sqlalchemy import select

from models import Order, Plan, ProfitRecord, StaffRole


async def create_active_plan(db_session, name="测试套餐", price=Decimal("100.00")):
    plan = Plan(name=name, price=price, duration_days=30, status="active")
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_orders_are_not_public(client):
    response = await client.get("/api/orders")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_order_list_is_bounded_and_paginated(client, db_session, auth_headers):
    for index in range(3):
        db_session.add(Order(order_no=f"ORD-PAGE-{index}", amount=10, status="pending"))
    await db_session.commit()
    response = await client.get("/api/orders?page=1&page_size=2", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 2
    assert body["total"] == 3
    assert body["page_size"] == 2
    assert (await client.get("/api/orders?page_size=101", headers=auth_headers)).status_code == 422


@pytest.mark.asyncio
async def test_create_order_is_always_pending_and_snapshots_plan(client, db_session, auth_headers):
    plan = await create_active_plan(db_session)
    response = await client.post(
        "/api/orders",
        headers=auth_headers,
        json={"plan_id": plan.id, "channel": "internal"},
    )
    assert response.status_code == 201
    order = response.json()["data"]
    assert order["status"] == "pending"
    assert order["amount"] == 100.0
    assert order["plan_name_snapshot"] == plan.name

    rejected = await client.post(
        "/api/orders",
        headers=auth_headers,
        json={"plan_id": plan.id, "status": "paid"},
    )
    assert rejected.status_code == 422


@pytest.mark.asyncio
async def test_support_can_read_but_cannot_mutate_orders(
    client, db_session, staff_headers_factory
):
    plan = await create_active_plan(db_session)
    support_headers = await staff_headers_factory(StaffRole.SUPPORT, "order-support")
    assert (await client.get("/api/orders", headers=support_headers)).status_code == 200
    response = await client.post(
        "/api/orders",
        headers=support_headers,
        json={"plan_id": plan.id},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_mark_paid_creates_exactly_one_profit_record(
    client, db_session, auth_headers
):
    plan = await create_active_plan(db_session, price=Decimal("99.99"))
    created = await client.post(
        "/api/orders",
        headers=auth_headers,
        json={"plan_id": plan.id},
    )
    order_id = created.json()["data"]["id"]

    paid = await client.post(f"/api/orders/{order_id}/mark-paid", headers=auth_headers)
    assert paid.status_code == 200
    assert paid.json()["data"]["status"] == "paid"
    duplicate = await client.post(f"/api/orders/{order_id}/mark-paid", headers=auth_headers)
    assert duplicate.status_code == 409

    result = await db_session.execute(
        select(ProfitRecord).where(ProfitRecord.order_id == order_id)
    )
    records = result.scalars().all()
    assert len(records) == 1
    record = records[0]
    total = sum(
        Decimal(str(getattr(record, field)))
        for field in (
            "tech_share",
            "market_share",
            "product_share",
            "service_share",
            "coordination_share",
            "record_share",
        )
    )
    assert total == Decimal("99.99")
    assert record.policy_version == 1


@pytest.mark.asyncio
async def test_profit_failure_keeps_order_pending(
    client, db_session, auth_headers, monkeypatch
):
    plan = await create_active_plan(db_session)
    created = await client.post(
        "/api/orders", headers=auth_headers, json={"plan_id": plan.id}
    )
    order_id = created.json()["data"]["id"]

    async def fail_profit(*_args, **_kwargs):
        raise RuntimeError("forced profit failure")

    monkeypatch.setattr(
        "services.profit_service.ProfitService.create_for_paid_order",
        fail_profit,
    )
    with pytest.raises(RuntimeError, match="forced profit failure"):
        await client.post(f"/api/orders/{order_id}/mark-paid", headers=auth_headers)
    db_session.expire_all()
    order = (await db_session.execute(select(Order).where(Order.id == order_id))).scalar_one()
    assert order.status == "pending"


@pytest.mark.asyncio
async def test_refund_reverses_profit_instead_of_deleting(
    client, db_session, auth_headers
):
    plan = await create_active_plan(db_session)
    created = await client.post(
        "/api/orders", headers=auth_headers, json={"plan_id": plan.id}
    )
    order_id = created.json()["data"]["id"]
    await client.post(f"/api/orders/{order_id}/mark-paid", headers=auth_headers)

    refunded = await client.post(
        f"/api/orders/{order_id}/refund",
        headers=auth_headers,
        json={"reason": "内部退款验证"},
    )
    assert refunded.status_code == 200
    assert refunded.json()["data"]["status"] == "refunded"

    record = (
        await db_session.execute(
            select(ProfitRecord).where(ProfitRecord.order_id == order_id)
        )
    ).scalar_one()
    assert record.status == "reversed"
    assert record.reversed_at is not None
    summary = await client.get("/api/profit/summary", headers=auth_headers)
    assert summary.json()["grand_total"] == 0
    assert summary.json()["reversed_total"] == 100.0


@pytest.mark.asyncio
async def test_cancelled_and_refunded_are_terminal(client, db_session, auth_headers):
    plan = await create_active_plan(db_session)
    created = await client.post(
        "/api/orders", headers=auth_headers, json={"plan_id": plan.id}
    )
    order_id = created.json()["data"]["id"]
    cancelled = await client.post(
        f"/api/orders/{order_id}/cancel",
        headers=auth_headers,
        json={"reason": "内部取消验证"},
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "cancelled"
    assert (
        await client.post(f"/api/orders/{order_id}/mark-paid", headers=auth_headers)
    ).status_code == 409
    assert (
        await client.patch(
            f"/api/orders/{order_id}",
            headers=auth_headers,
            json={"amount": "80.00"},
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_plan_price_change_does_not_rewrite_order_snapshot(
    client, db_session, auth_headers
):
    plan = await create_active_plan(db_session, price=Decimal("100.00"))
    created = await client.post(
        "/api/orders", headers=auth_headers, json={"plan_id": plan.id}
    )
    order_id = created.json()["data"]["id"]
    plan.price = Decimal("200.00")
    await db_session.commit()
    detail = await client.get(f"/api/orders/{order_id}", headers=auth_headers)
    assert detail.json()["data"]["plan_price_snapshot"] == 100.0
