"""Demo records never cross into the verified execution ledger."""
from __future__ import annotations

import json

import pytest
from sqlalchemy import func, select

from core.dependencies import get_current_user
from main import app
from models import AutomationBatch, RunLog, Setting, User
from models.demo import DemoBatch, DemoRun
from models.feedback import ExecutionVerification


async def _install_demo_tool(db_session) -> None:
    db_session.add(
        Setting(
            key="tool_configs",
            value=json.dumps([
                {
                    "id": "tool_demo_batch",
                    "name": "内测演示工具",
                    "platform_key": "amazon",
                    "capability_key": "demo_batch",
                    "availability": "demo_only",
                    "demo_scenario_id": "demo_batch_walkthrough_v1",
                    "supports_demo_single": True,
                    "supports_demo_batch": True,
                    "supports_batch": True,
                    "target_url": "",
                }
            ], ensure_ascii=False),
        )
    )
    db_session.add(User(id=1, name="Demo Owner", is_active=True))
    await db_session.commit()


def _as_user(user_id: int = 1):
    async def dependency() -> dict:
        return {
            "user_id": user_id,
            "role": "user",
            "auth_code_id": None,
            "device_id": "demo-device",
        }

    return dependency


@pytest.mark.asyncio
async def test_single_demo_uses_only_demo_table(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()

    created = await client.post(
        "/api/demo/runs",
        headers={"Idempotency-Key": "single-demo-1"},
        json={
            "tool_id": "tool_demo_batch",
            "tool_name": "客户端不可信名称",
            "platform_key": "aliexpress",
            "scenario_id": "client-scenario",
            "total_step_count": 2,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["record_kind"] == "demo"
    assert body["tool_name_snapshot"] == "内测演示工具"
    assert body["platform_key"] == "amazon"
    assert body["scenario_id"] == "demo_batch_walkthrough_v1"

    running = await client.patch(
        f"/api/demo/runs/{body['id']}",
        json={
            "event_seq": 1,
            "status": "running",
            "current_step_id": "step-1",
            "completed_step_count": 1,
        },
    )
    assert running.status_code == 200
    finished = await client.post(
        f"/api/demo/runs/{body['id']}/finish",
        json={"event_seq": 2, "completed_step_count": 2},
    )
    assert finished.status_code == 200
    assert finished.json()["status"] == "completed"

    assert (await db_session.execute(select(func.count(DemoRun.id)))).scalar() == 1
    assert (await db_session.execute(select(func.count(RunLog.id)))).scalar() == 0


@pytest.mark.asyncio
async def test_demo_event_sequence_and_state_transitions_are_enforced(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()
    created = (
        await client.post(
            "/api/demo/runs",
            json={
                "tool_id": "tool_demo_batch",
                "tool_name": "demo",
                "platform_key": "amazon",
                "scenario_id": "demo",
                "total_step_count": 1,
            },
        )
    ).json()
    run_id = created["id"]
    first = await client.patch(
        f"/api/demo/runs/{run_id}",
        json={"event_seq": 2, "status": "running", "completed_step_count": 0},
    )
    assert first.status_code == 200
    stale = await client.patch(
        f"/api/demo/runs/{run_id}",
        json={"event_seq": 1, "status": "paused", "completed_step_count": 0},
    )
    assert stale.status_code == 409
    fake_success = await client.patch(
        f"/api/demo/runs/{run_id}",
        json={"event_seq": 3, "status": "completed", "completed_step_count": 1},
    )
    assert fake_success.status_code == 409
    invalid_status = await client.patch(
        f"/api/demo/runs/{run_id}",
        json={"event_seq": 3, "status": "succeeded", "completed_step_count": 1},
    )
    assert invalid_status.status_code == 422


@pytest.mark.asyncio
async def test_batch_payload_rejects_source_rows_and_writes_no_real_batch(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()
    rejected = await client.post(
        "/api/demo/batches",
        json={
            "tool_id": "tool_demo_batch",
            "tool_name": "demo",
            "platform_key": "amazon",
            "scenario_id": "demo",
            "row_count": 2,
            "rows": [{"account": "sensitive@example.com", "cookie": "secret"}],
        },
    )
    assert rejected.status_code == 422

    created = await client.post(
        "/api/demo/batches",
        headers={"Idempotency-Key": "batch-demo-1"},
        json={
            "tool_id": "tool_demo_batch",
            "tool_name": "demo",
            "platform_key": "amazon",
            "scenario_id": "demo",
            "row_count": 2,
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["record_kind"] == "demo"
    assert len(payload["items"]) == 2
    assert all(item["item_ref"].startswith("demo_item_") for item in payload["items"])
    assert (await db_session.execute(select(func.count(DemoBatch.id)))).scalar() == 1
    assert (await db_session.execute(select(func.count(AutomationBatch.id)))).scalar() == 0


@pytest.mark.asyncio
async def test_demo_batch_supports_concurrent_items_and_recounts_before_finish(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()
    created = await client.post(
        "/api/demo/batches",
        json={
            "tool_id": "tool_demo_batch",
            "tool_name": "demo",
            "platform_key": "amazon",
            "scenario_id": "demo",
            "row_count": 3,
        },
    )
    assert created.status_code == 201
    batch = created.json()
    batch_id = batch["id"]
    item_refs = [item["item_ref"] for item in batch["items"]]

    for item_ref in item_refs:
        response = await client.put(
            f"/api/demo/batches/{batch_id}/items/{item_ref}",
            json={"event_seq": 1, "status": "playing", "simulated_outcome": None},
        )
        assert response.status_code == 200

    running = await client.patch(
        f"/api/demo/batches/{batch_id}",
        json={
            "event_seq": 1,
            "status": "running",
            "queued_count": 0,
            "playing_count": 3,
            "played_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        },
    )
    assert running.status_code == 200
    assert running.json()["playing_count"] == 3

    terminal_updates = [
        (item_refs[0], "played", "completed_example"),
        (item_refs[1], "played", "attention_example"),
        (item_refs[2], "error", "failure_example"),
    ]
    for item_ref, item_status, outcome in terminal_updates:
        response = await client.put(
            f"/api/demo/batches/{batch_id}/items/{item_ref}",
            json={"event_seq": 2, "status": item_status, "simulated_outcome": outcome},
        )
        assert response.status_code == 200

    finished = await client.post(
        f"/api/demo/batches/{batch_id}/finish",
        json={"event_seq": 2},
    )
    assert finished.status_code == 200
    assert {
        key: finished.json()[key]
        for key in (
            "status",
            "queued_count",
            "playing_count",
            "played_count",
            "skipped_count",
            "error_count",
        )
    } == {
        "status": "completed",
        "queued_count": 0,
        "playing_count": 0,
        "played_count": 2,
        "skipped_count": 0,
        "error_count": 1,
    }


@pytest.mark.asyncio
async def test_cancelling_demo_batch_terminalizes_unfinished_items(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()
    batch = (
        await client.post(
            "/api/demo/batches",
            json={
                "tool_id": "tool_demo_batch",
                "tool_name": "demo",
                "platform_key": "amazon",
                "scenario_id": "demo",
                "row_count": 2,
            },
        )
    ).json()
    batch_id = batch["id"]
    for item in batch["items"]:
        assert (
            await client.put(
                f"/api/demo/batches/{batch_id}/items/{item['item_ref']}",
                json={"event_seq": 1, "status": "playing", "simulated_outcome": None},
            )
        ).status_code == 200

    assert (
        await client.patch(
            f"/api/demo/batches/{batch_id}",
            json={
                "event_seq": 1,
                "status": "running",
                "queued_count": 0,
                "playing_count": 2,
                "played_count": 0,
                "skipped_count": 0,
                "error_count": 0,
            },
        )
    ).status_code == 200
    cancelled = await client.patch(
        f"/api/demo/batches/{batch_id}",
        json={
            "event_seq": 2,
            "status": "cancelled",
            "queued_count": 0,
            "playing_count": 2,
            "played_count": 0,
            "skipped_count": 0,
            "error_count": 0,
        },
    )
    assert cancelled.status_code == 200
    body = cancelled.json()
    assert body["status"] == "cancelled"
    assert body["playing_count"] == 0
    assert body["skipped_count"] == 2
    assert all(item["status"] == "skipped" for item in body["items"])


@pytest.mark.asyncio
async def test_verified_execution_endpoint_hides_legacy_records(client, db_session):
    await _install_demo_tool(db_session)
    app.dependency_overrides[get_current_user] = _as_user()
    db_session.add_all([
        RunLog(
            user_id=1,
            tool_id="legacy",
            tool_name="历史日志",
            status="success",
            verification_state=ExecutionVerification.LEGACY_UNVERIFIED,
        ),
        RunLog(
            user_id=1,
            tool_id="verified",
            tool_name="已核验执行",
            status="succeeded",
            verification_state=ExecutionVerification.VERIFIED,
        ),
    ])
    await db_session.commit()

    response = await client.get("/api/executions?page_size=100")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["tool_id"] for item in body["data"]] == ["verified"]
    assert body["data"][0]["verification"] == "verified"
