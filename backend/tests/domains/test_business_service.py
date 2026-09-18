"""Persist live batch summaries with the same autoflush policy as production."""
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from domains.automation import business_service as service
from models import AuthCode, AutomationBatch, AutomationBatchItem, Plan
from schemas.business import BatchFinish, BatchItemUpdate, BatchUpdate


@pytest.fixture
async def live_batch(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> tuple[int, dict[str, Any]]:
    monkeypatch.setattr(settings, "TOOL_EXECUTION_MODE", "live")
    db_session.autoflush = False
    plan = Plan(name="计数回归套餐", price=100, duration_days=30, product_type="business")
    db_session.add(plan)
    await db_session.flush()
    code = AuthCode(code="COUNTER-REGRESSION", plan_id=plan.id)
    db_session.add(code)
    await db_session.flush()
    batch = AutomationBatch(
        client_batch_id="counter-regression-batch", auth_code_id=code.id,
        device_id="counter-device", tool_id="counter-tool", tool_name="计数测试",
        total_count=2, pending_count=2,
    )
    db_session.add(batch)
    await db_session.commit()
    return batch.id, {"auth_code_id": code.id, "device_id": "counter-device"}


@pytest.mark.asyncio
async def test_recount_includes_pending_writes_and_unreported_items(db_session: AsyncSession, live_batch) -> None:
    batch_id, context = live_batch
    running = BatchItemUpdate(account_label_masked="客户", status="running")
    await service.upsert_batch_item(db_session, batch_id, " first ", running, context)
    batch = await service.get_batch(db_session, batch_id, context)
    assert (batch["pending_count"], batch["running_count"], batch["completed_count"]) == (1, 1, 0)
    assert batch["items"][0]["client_item_id"] == "first"
    assert batch["items"][0]["started_at"]

    # Heartbeat claims cannot replace persisted child state.
    batch = await service.update_batch(db_session, batch_id, BatchUpdate(completed_count=2), context)
    assert (batch["pending_count"], batch["running_count"], batch["completed_count"]) == (1, 1, 0)
    with pytest.raises(HTTPException) as early_finish:
        await service.finish_batch(db_session, batch_id, BatchFinish(status="completed"), context)
    assert early_finish.value.status_code == 409
    with pytest.raises(HTTPException) as early_update:
        await service.update_batch(db_session, batch_id, BatchUpdate(status="completed", completed_count=2), context)
    assert early_update.value.status_code == 409

    waiting = BatchItemUpdate(account_label_masked="客户", status="waiting_user", intervention_type="captcha")
    item = await service.upsert_batch_item(db_session, batch_id, "first", waiting, context)
    assert item["customer_message"] == "需要完成页面验证码"
    assert (await service.get_batch(db_session, batch_id, context))["waiting_count"] == 1
    completed = BatchItemUpdate(account_label_masked="客户", status="completed")
    for item_id in ["first", "second"]:
        await service.upsert_batch_item(db_session, batch_id, item_id, completed, context)
    batch = await service.finish_batch(db_session, batch_id, BatchFinish(status="completed"), context)
    assert batch["completed_count"] == 2
    assert batch["pending_count"] == batch["running_count"] == batch["waiting_count"] == 0
    assert batch["status"] == "completed"


@pytest.mark.asyncio
async def test_rejects_bad_counters_ids_and_extra_items(db_session: AsyncSession, live_batch) -> None:
    batch_id, context = live_batch
    with pytest.raises(HTTPException) as invalid_count:
        await service.update_batch(db_session, batch_id, BatchUpdate(pending_count=3), context)
    assert invalid_count.value.status_code == 422
    item = BatchItemUpdate(account_label_masked="客户", status="completed")
    for item_id in [" ", "x" * 101]:
        with pytest.raises(HTTPException) as invalid_id:
            await service.upsert_batch_item(db_session, batch_id, item_id, item, context)
        assert invalid_id.value.status_code == 422
    # Before child reports exist a correctly summed heartbeat remains valid.
    batch = await service.update_batch(db_session, batch_id, BatchUpdate(pending_count=1, running_count=1), context)
    assert batch["running_count"] == 1
    for item_id in ["one", "two"]:
        await service.upsert_batch_item(db_session, batch_id, item_id, item, context)
    with pytest.raises(HTTPException) as extra_item:
        await service.upsert_batch_item(db_session, batch_id, "three", item, context)
    assert extra_item.value.status_code == 409
    assert await db_session.scalar(select(func.count(AutomationBatchItem.id)).where(AutomationBatchItem.batch_id == batch_id)) == 2
    batch = await service.update_batch(db_session, batch_id, BatchUpdate(status="completed", completed_count=2), context)
    assert batch["status"] == "completed"


@pytest.mark.asyncio
async def test_cancelled_and_failed_children_remain_terminal(db_session: AsyncSession, live_batch) -> None:
    batch_id, context = live_batch
    for item_id, status in [("one", "cancelled"), ("two", "failed")]:
        await service.upsert_batch_item(db_session, batch_id, item_id, BatchItemUpdate(account_label_masked="客户", status=status), context)
    batch = await service.finish_batch(db_session, batch_id, BatchFinish(status="completed"), context)
    assert batch["failed_count"] == 2
    assert batch["completed_count"] == 0


@pytest.mark.asyncio
async def test_cancelled_items_do_not_make_legacy_summary_fail(db_session: AsyncSession, live_batch) -> None:
    batch_id, context = live_batch
    for item_id, status in [("one", "completed"), ("two", "cancelled")]:
        await service.upsert_batch_item(
            db_session, batch_id, item_id,
            BatchItemUpdate(account_label_masked="客户", status=status), context,
        )
    # Electron's existing summary has no cancelled field and does not add
    # cancelled items to failed. Its terminal summary legitimately sums to
    # less than total_count; persisted child rows still provide exact counts.
    batch = await service.update_batch(
        db_session, batch_id, BatchUpdate(status="completed", completed_count=1), context,
    )
    assert batch["status"] == "completed"
    assert batch["completed_count"] == batch["failed_count"] == 1
