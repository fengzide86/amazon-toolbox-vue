from decimal import Decimal

import pytest

from models import Order, ProfitRecord, StaffRole


@pytest.mark.asyncio
async def test_profit_records_are_paginated(client, auth_headers, db_session):
    for index in range(3):
        order = Order(order_no=f"PROFIT-{index}", amount=10, status="paid")
        db_session.add(order)
        await db_session.flush()
        db_session.add(
            ProfitRecord(
                order_id=order.id,
                order_amount_snapshot=10,
                tech_share=3,
                market_share=2.5,
                product_share=1.5,
                service_share=1.5,
                coordination_share=1,
                record_share=.5,
            )
        )
    await db_session.commit()
    response = await client.get("/api/profit?page=1&page_size=2", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()["data"]) == 2
    assert response.json()["total"] == 3
    assert (await client.get("/api/profit?page_size=101", headers=auth_headers)).status_code == 422


@pytest.mark.asyncio
async def test_profit_summary_only_counts_active_ledger(client, auth_headers, db_session):
    active_order = Order(order_no="ACTIVE-PROFIT", amount=100, status="paid")
    reversed_order = Order(order_no="REVERSED-PROFIT", amount=50, status="refunded")
    db_session.add_all([active_order, reversed_order])
    await db_session.flush()
    db_session.add_all(
        [
            ProfitRecord(
                order_id=active_order.id,
                status="active",
                order_amount_snapshot=100,
                tech_share=30,
                market_share=25,
                product_share=15,
                service_share=15,
                coordination_share=10,
                record_share=5,
            ),
            ProfitRecord(
                order_id=reversed_order.id,
                status="reversed",
                order_amount_snapshot=50,
                tech_share=15,
                market_share=12.5,
                product_share=7.5,
                service_share=7.5,
                coordination_share=5,
                record_share=2.5,
            ),
        ]
    )
    await db_session.commit()
    summary = (await client.get("/api/profit/summary", headers=auth_headers)).json()
    assert summary["grand_total"] == 100
    assert summary["reversed_total"] == 50
    assert summary["gross_total"] == 150
    assert summary["active"] == {
        "tech": 30.0,
        "market": 25.0,
        "product": 15.0,
        "service": 15.0,
        "coordination": 10.0,
        "record": 5.0,
        "grand_total": 100.0,
    }
    assert summary["reversed"] == {
        "tech": 15.0,
        "market": 12.5,
        "product": 7.5,
        "service": 7.5,
        "coordination": 5.0,
        "record": 2.5,
        "grand_total": 50.0,
    }


@pytest.mark.asyncio
async def test_profit_policy_is_versioned_and_decimal_safe(client, auth_headers):
    initial = await client.get("/api/profit/policy", headers=auth_headers)
    assert initial.status_code == 200
    assert initial.json()["data"]["version"] == 1

    updated = await client.put(
        "/api/profit/policy",
        headers=auth_headers,
        json={
            "ratios": {
                "tech": "0.20",
                "market": "0.20",
                "product": "0.20",
                "service": "0.20",
                "coordination": "0.10",
                "record": "0.10",
            }
        },
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["version"] == 2
    assert Decimal(updated.json()["data"]["ratios"]["tech"]) == Decimal("0.20")


@pytest.mark.asyncio
async def test_profit_policy_rejects_invalid_sum(client, auth_headers):
    response = await client.put(
        "/api/profit/policy",
        headers=auth_headers,
        json={
            "ratios": {
                "tech": "0.50",
                "market": "0.50",
                "product": "0.50",
                "service": "0",
                "coordination": "0",
                "record": "0",
            }
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_profit_permissions(client, staff_headers_factory):
    operator = await staff_headers_factory(StaffRole.OPERATOR, "profit-operator")
    support = await staff_headers_factory(StaffRole.SUPPORT, "profit-support")
    assert (await client.get("/api/profit", headers=operator)).status_code == 200
    assert (await client.get("/api/profit", headers=support)).status_code == 403
    response = await client.put(
        "/api/profit/policy",
        headers=operator,
        json={
            "ratios": {
                "tech": ".30",
                "market": ".25",
                "product": ".15",
                "service": ".15",
                "coordination": ".10",
                "record": ".05",
            }
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_profit_requires_authentication(client):
    assert (await client.get("/api/profit/summary")).status_code == 401
