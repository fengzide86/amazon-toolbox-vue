import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from models import AuthCode, AutomationBatch, AutomationBatchItem, Plan, Setting


async def login(client: AsyncClient, code: str, device_id: str = "business-device") -> dict:
    response = await client.post("/api/auth/verify", json={
        "code": code,
        "device_id": device_id,
        "device_name": "批量工作站",
    })
    body = response.json()
    assert body["success"] is True
    return {"Authorization": f"Bearer {body['data']['token']}"}


@pytest.mark.asyncio
async def test_large_consumer_plan_cannot_use_business_api(client: AsyncClient, db_session):
    plan = Plan(name="普通团队版", price=499, duration_days=30, product_type="consumer", entitlements="{}")
    db_session.add(plan)
    await db_session.flush()
    db_session.add(AuthCode(code="CONSUMER-LARGE-SEATS", plan_id=plan.id, seat_limit=50, max_devices=50))
    db_session.add(Setting(key="business_workspace_enabled", value="true"))
    await db_session.commit()

    headers = await login(client, "CONSUMER-LARGE-SEATS")
    response = await client.get("/api/business/bootstrap", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_business_batch_is_idempotent_and_only_stores_masked_control_data(client: AsyncClient, db_session):
    plan = Plan(
        name="专业批量版",
        price=999,
        duration_days=30,
        product_type="business",
        entitlements=json.dumps({
            "batch_execution": True,
            "multi_account_workspace": True,
            "max_batch_rows": 10,
            "max_open_sessions": 4,
        }),
    )
    db_session.add(plan)
    await db_session.flush()
    db_session.add(AuthCode(code="BUSINESS-BATCH-001", plan_id=plan.id, seat_limit=5, max_devices=5))
    db_session.add_all([
        Setting(key="business_workspace_enabled", value="true"),
        Setting(key="tool_configs", value=json.dumps([{
            "id": "tool_register",
            "name": "注册自动处理",
            "status": "online",
            "release_status": "available",
            "supports_batch": True,
            "batch_input_schema": [{"key": "account_label", "label": "客户简称", "required": True}],
        }], ensure_ascii=False)),
    ])
    await db_session.commit()

    headers = await login(client, "BUSINESS-BATCH-001")
    payload = {"client_batch_id": "client-batch-001", "tool_id": "tool_register", "tool_name": "不可信名称", "total_count": 2}
    first = await client.post("/api/business/batches", json=payload, headers=headers)
    second = await client.post("/api/business/batches", json=payload, headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    first_data = first.json()["data"]
    assert first_data["id"] == second.json()["data"]["id"]
    assert first_data["tool_name"] == "注册自动处理"

    item = await client.put(
        f"/api/business/batches/{first_data['id']}/items/item-1",
        json={
            "account_label_masked": "customer@example.com",
            "status": "waiting_user",
            "intervention_type": "captcha",
            "customer_message": "password=should-never-be-stored",
        },
        headers=headers,
    )
    assert item.status_code == 200
    assert item.json()["data"]["account_label_masked"] == "cu***@example.com"
    assert item.json()["data"]["customer_message"] == "需要完成页面验证码"

    batch_count = len((await db_session.execute(select(AutomationBatch))).scalars().all())
    stored_item = (await db_session.execute(select(AutomationBatchItem))).scalar_one()
    assert batch_count == 1
    assert "password" not in (stored_item.customer_message or "").lower()
