"""Application service for internal demo walkthroughs.

Demo state is intentionally isolated from real Runner launches and live
automation tables.  This service owns every transition and transaction used
by the demo HTTP endpoints.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from domains.catalog import force_demo_only_tool_configs, normalize_tool_configs
from models.demo import DemoBatch, DemoBatchItem, DemoRun
from models.system import Setting
from schemas.demo import (
    DemoBatchCreate,
    DemoBatchItemResponse,
    DemoBatchItemUpdate,
    DemoBatchResponse,
    DemoBatchUpdate,
    DemoEvent,
    DemoRunCreate,
    DemoRunFinish,
    DemoRunResponse,
    DemoRunUpdate,
    PaginatedDemoBatches,
    PaginatedDemoRuns,
)

RUN_TRANSITIONS: dict[str, set[str]] = {
    "created": {"created", "running", "cancelled", "error"},
    "running": {"running", "paused", "cancelled", "error"},
    "paused": {"paused", "running", "cancelled", "error"},
    "completed": set(),
    "cancelled": set(),
    "error": set(),
}
BATCH_TRANSITIONS: dict[str, set[str]] = {
    "created": {"created", "running", "cancelled", "error"},
    "running": {"running", "cancelled", "error"},
    "completed": set(),
    "cancelled": set(),
    "error": set(),
}
ITEM_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"queued", "playing", "skipped", "error"},
    "playing": {"playing", "played", "skipped", "error"},
    "played": set(),
    "skipped": set(),
    "error": set(),
}


def _owner(current_user: dict[str, Any]) -> tuple[int, int | None, str | None]:
    user_id = current_user.get("user_id")
    if not isinstance(user_id, int) or user_id <= 0:
        raise HTTPException(status_code=403, detail="演示流程仅对授权用户开放")
    return (
        user_id,
        cast(int | None, current_user.get("auth_code_id")),
        cast(str | None, current_user.get("device_id")),
    )


def _check_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > 120:
        raise HTTPException(status_code=422, detail="Idempotency-Key 长度必须为 1-120")
    return normalized


async def _resolve_demo_tool(
    db: AsyncSession,
    tool_id: str,
    *,
    batch: bool,
) -> dict[str, Any]:
    if settings.TOOL_EXECUTION_MODE != "demo":
        raise HTTPException(status_code=409, detail="FEATURE_DISABLED: 当前未开启演示执行模式")
    raw_value = (
        await db.execute(select(Setting.value).where(Setting.key == "tool_configs"))
    ).scalar_one_or_none()
    try:
        tools = force_demo_only_tool_configs(normalize_tool_configs(json.loads(raw_value or "[]")))
    except (TypeError, ValueError, json.JSONDecodeError):
        tools = []
    tool = next((item for item in tools if item.get("id") == tool_id), None)
    if not tool:
        raise HTTPException(status_code=404, detail="演示工具不存在")
    supported = tool.get("supports_demo_batch") if batch else tool.get("supports_demo_single")
    if tool.get("availability") != "demo_only" or not supported:
        raise HTTPException(status_code=409, detail="该工具未开放当前演示流程")
    return tool


def _ensure_event_seq(current: int, incoming: int) -> bool:
    if incoming < current:
        raise HTTPException(status_code=409, detail="演示事件序号已过期")
    return incoming == current


def _ensure_transition(
    current: str,
    target: str,
    transitions: dict[str, set[str]],
) -> None:
    if target not in transitions.get(current, set()):
        raise HTTPException(status_code=409, detail=f"不允许从 {current} 变更为 {target}")


async def _owned_run(
    db: AsyncSession,
    run_id: str,
    user_id: int,
    *,
    lock: bool = False,
) -> DemoRun:
    query = select(DemoRun).where(DemoRun.id == run_id, DemoRun.user_id == user_id)
    if lock:
        query = query.with_for_update()
    run = (await db.execute(query)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="演示记录不存在")
    return run


async def _owned_batch(
    db: AsyncSession,
    batch_id: str,
    user_id: int,
    *,
    lock: bool = False,
) -> DemoBatch:
    query = select(DemoBatch).where(DemoBatch.id == batch_id, DemoBatch.user_id == user_id)
    if lock:
        query = query.with_for_update()
    batch = (await db.execute(query)).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="演示批次不存在")
    return batch


async def _batch_response(
    db: AsyncSession,
    batch: DemoBatch,
    *,
    include_items: bool,
) -> DemoBatchResponse:
    response = DemoBatchResponse.model_validate(batch)
    if not include_items:
        return response
    items = (
        await db.execute(
            select(DemoBatchItem)
            .where(DemoBatchItem.batch_id == batch.id)
            .order_by(DemoBatchItem.id)
        )
    ).scalars().all()
    return response.model_copy(
        update={"items": [DemoBatchItemResponse.model_validate(item) for item in items]}
    )


async def _locked_batch_items(db: AsyncSession, batch_id: str) -> list[DemoBatchItem]:
    return list(
        (
            await db.execute(
                select(DemoBatchItem)
                .where(DemoBatchItem.batch_id == batch_id)
                .order_by(DemoBatchItem.id)
                .with_for_update()
            )
        ).scalars().all()
    )


def _batch_item_counts(items: list[DemoBatchItem]) -> dict[str, int]:
    statuses = [item.status for item in items]
    return {
        "queued_count": statuses.count("queued"),
        "playing_count": statuses.count("playing"),
        "played_count": statuses.count("played"),
        "skipped_count": statuses.count("skipped"),
        "error_count": statuses.count("error"),
    }


def _apply_batch_item_counts(batch: DemoBatch, counts: dict[str, int]) -> None:
    for field, value in counts.items():
        setattr(batch, field, value)


async def create_demo_run(
    db: AsyncSession,
    request: DemoRunCreate,
    current_user: dict[str, Any],
    *,
    idempotency_key: str | None,
) -> DemoRunResponse:
    user_id, auth_code_id, device_id = _owner(current_user)
    tool = await _resolve_demo_tool(db, request.tool_id, batch=False)
    normalized_key = _check_idempotency_key(idempotency_key)
    if normalized_key:
        existing = (
            await db.execute(
                select(DemoRun).where(
                    DemoRun.user_id == user_id,
                    DemoRun.idempotency_key == normalized_key,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return DemoRunResponse.model_validate(existing)

    run = DemoRun(
        id=f"demo_run_{secrets.token_hex(12)}",
        idempotency_key=normalized_key,
        user_id=user_id,
        auth_code_id=auth_code_id,
        device_id=device_id,
        tool_id=request.tool_id,
        tool_name_snapshot=tool["name"],
        platform_key=tool["platform_key"],
        scenario_id=tool["demo_scenario_id"],
        total_step_count=request.total_step_count,
    )
    db.add(run)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if normalized_key:
            existing = (
                await db.execute(
                    select(DemoRun).where(
                        DemoRun.user_id == user_id,
                        DemoRun.idempotency_key == normalized_key,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                return DemoRunResponse.model_validate(existing)
        raise
    await db.refresh(run)
    return DemoRunResponse.model_validate(run)


async def list_demo_runs(
    db: AsyncSession,
    current_user: dict[str, Any],
    *,
    page: int,
    page_size: int,
    platform_key: str | None,
    tool_id: str | None,
) -> PaginatedDemoRuns:
    user_id, _, _ = _owner(current_user)
    conditions: list[Any] = [DemoRun.user_id == user_id]
    if platform_key:
        conditions.append(DemoRun.platform_key == platform_key)
    if tool_id:
        conditions.append(DemoRun.tool_id == tool_id)
    total = (await db.execute(select(func.count(DemoRun.id)).where(*conditions))).scalar() or 0
    runs = (
        await db.execute(
            select(DemoRun)
            .where(*conditions)
            .order_by(DemoRun.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return PaginatedDemoRuns(
        data=[DemoRunResponse.model_validate(run) for run in runs],
        page=page,
        page_size=page_size,
        total=total,
    )


async def get_demo_run(
    db: AsyncSession,
    run_id: str,
    current_user: dict[str, Any],
) -> DemoRunResponse:
    user_id, _, _ = _owner(current_user)
    return DemoRunResponse.model_validate(await _owned_run(db, run_id, user_id))


async def update_demo_run(
    db: AsyncSession,
    run_id: str,
    request: DemoRunUpdate,
    current_user: dict[str, Any],
) -> DemoRunResponse:
    user_id, _, _ = _owner(current_user)
    run = await _owned_run(db, run_id, user_id, lock=True)
    if _ensure_event_seq(run.event_seq, request.event_seq):
        return DemoRunResponse.model_validate(run)
    if request.status == "completed":
        raise HTTPException(status_code=409, detail="请使用演示完成接口")
    _ensure_transition(run.status, request.status, RUN_TRANSITIONS)
    if request.completed_step_count is not None and request.completed_step_count > run.total_step_count:
        raise HTTPException(status_code=422, detail="已完成步骤不能超过总步骤")
    if request.status == "error" and not request.error_code:
        raise HTTPException(status_code=422, detail="演示异常必须提供 error_code")

    run.event_seq = request.event_seq
    run.status = request.status
    run.current_step_id = request.current_step_id
    run.error_code = request.error_code
    if request.completed_step_count is not None:
        run.completed_step_count = request.completed_step_count
    if request.status == "running" and not run.started_at:
        run.started_at = datetime.now()
    if request.status in {"cancelled", "error"}:
        run.finished_at = datetime.now()
    await db.commit()
    await db.refresh(run)
    return DemoRunResponse.model_validate(run)


async def finish_demo_run(
    db: AsyncSession,
    run_id: str,
    request: DemoRunFinish,
    current_user: dict[str, Any],
) -> DemoRunResponse:
    user_id, _, _ = _owner(current_user)
    run = await _owned_run(db, run_id, user_id, lock=True)
    if _ensure_event_seq(run.event_seq, request.event_seq):
        return DemoRunResponse.model_validate(run)
    if run.status not in {"running", "paused"}:
        raise HTTPException(status_code=409, detail="当前演示不能完成")
    if request.completed_step_count != run.total_step_count:
        raise HTTPException(status_code=422, detail="演示步骤尚未全部播放")
    run.event_seq = request.event_seq
    run.status = "completed"
    run.completed_step_count = run.total_step_count
    run.simulated_outcome = request.simulated_outcome
    run.current_step_id = None
    run.finished_at = datetime.now()
    await db.commit()
    await db.refresh(run)
    return DemoRunResponse.model_validate(run)


async def cancel_demo_run(
    db: AsyncSession,
    run_id: str,
    request: DemoEvent,
    current_user: dict[str, Any],
) -> DemoRunResponse:
    user_id, _, _ = _owner(current_user)
    run = await _owned_run(db, run_id, user_id, lock=True)
    if _ensure_event_seq(run.event_seq, request.event_seq):
        return DemoRunResponse.model_validate(run)
    _ensure_transition(run.status, "cancelled", RUN_TRANSITIONS)
    run.event_seq = request.event_seq
    run.status = "cancelled"
    run.finished_at = datetime.now()
    await db.commit()
    await db.refresh(run)
    return DemoRunResponse.model_validate(run)


async def create_demo_batch(
    db: AsyncSession,
    request: DemoBatchCreate,
    current_user: dict[str, Any],
    *,
    idempotency_key: str | None,
) -> DemoBatchResponse:
    user_id, auth_code_id, device_id = _owner(current_user)
    tool = await _resolve_demo_tool(db, request.tool_id, batch=True)
    normalized_key = _check_idempotency_key(idempotency_key)
    if normalized_key:
        existing = (
            await db.execute(
                select(DemoBatch).where(
                    DemoBatch.user_id == user_id,
                    DemoBatch.idempotency_key == normalized_key,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return await _batch_response(db, existing, include_items=True)

    batch = DemoBatch(
        id=f"demo_batch_{secrets.token_hex(12)}",
        idempotency_key=normalized_key,
        user_id=user_id,
        auth_code_id=auth_code_id,
        device_id=device_id,
        tool_id=request.tool_id,
        tool_name_snapshot=tool["name"],
        platform_key=tool["platform_key"],
        scenario_id=tool["demo_scenario_id"],
        row_count=request.row_count,
        queued_count=request.row_count,
    )
    db.add(batch)
    for _ in range(request.row_count):
        db.add(
            DemoBatchItem(
                batch_id=batch.id,
                item_ref=f"demo_item_{secrets.token_hex(8)}",
            )
        )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if normalized_key:
            existing = (
                await db.execute(
                    select(DemoBatch).where(
                        DemoBatch.user_id == user_id,
                        DemoBatch.idempotency_key == normalized_key,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                return await _batch_response(db, existing, include_items=True)
        raise
    await db.refresh(batch)
    return await _batch_response(db, batch, include_items=True)


async def list_demo_batches(
    db: AsyncSession,
    current_user: dict[str, Any],
    *,
    page: int,
    page_size: int,
) -> PaginatedDemoBatches:
    user_id, _, _ = _owner(current_user)
    condition = DemoBatch.user_id == user_id
    total = (await db.execute(select(func.count(DemoBatch.id)).where(condition))).scalar() or 0
    batches = (
        await db.execute(
            select(DemoBatch)
            .where(condition)
            .order_by(DemoBatch.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return PaginatedDemoBatches(
        data=[await _batch_response(db, batch, include_items=False) for batch in batches],
        page=page,
        page_size=page_size,
        total=total,
    )


async def get_demo_batch(
    db: AsyncSession,
    batch_id: str,
    current_user: dict[str, Any],
) -> DemoBatchResponse:
    user_id, _, _ = _owner(current_user)
    batch = await _owned_batch(db, batch_id, user_id)
    return await _batch_response(db, batch, include_items=True)


async def update_demo_batch(
    db: AsyncSession,
    batch_id: str,
    request: DemoBatchUpdate,
    current_user: dict[str, Any],
) -> DemoBatchResponse:
    user_id, _, _ = _owner(current_user)
    batch = await _owned_batch(db, batch_id, user_id, lock=True)
    if _ensure_event_seq(batch.event_seq, request.event_seq):
        return await _batch_response(db, batch, include_items=True)
    if request.status == "completed":
        raise HTTPException(status_code=409, detail="请使用批量演示完成接口")
    _ensure_transition(batch.status, request.status, BATCH_TRANSITIONS)

    next_counts = {
        "queued_count": batch.queued_count if request.queued_count is None else request.queued_count,
        "playing_count": batch.playing_count if request.playing_count is None else request.playing_count,
        "played_count": batch.played_count if request.played_count is None else request.played_count,
        "skipped_count": batch.skipped_count if request.skipped_count is None else request.skipped_count,
        "error_count": batch.error_count if request.error_count is None else request.error_count,
    }
    if sum(next_counts.values()) != batch.row_count:
        raise HTTPException(status_code=422, detail="演示批次数量汇总必须等于总行数")
    if request.status == "cancelled":
        now = datetime.now()
        items = await _locked_batch_items(db, batch.id)
        for item in items:
            if item.status not in {"queued", "playing"}:
                continue
            item.status = "skipped"
            item.event_seq += 1
            item.finished_at = now
        next_counts = _batch_item_counts(items)
    batch.event_seq = request.event_seq
    batch.status = request.status
    _apply_batch_item_counts(batch, next_counts)
    if request.status == "running" and not batch.started_at:
        batch.started_at = datetime.now()
    if request.status in {"cancelled", "error"}:
        batch.finished_at = datetime.now()
    await db.commit()
    await db.refresh(batch)
    return await _batch_response(db, batch, include_items=True)


async def update_demo_batch_item(
    db: AsyncSession,
    batch_id: str,
    item_ref: str,
    request: DemoBatchItemUpdate,
    current_user: dict[str, Any],
) -> DemoBatchItemResponse:
    user_id, _, _ = _owner(current_user)
    batch = await _owned_batch(db, batch_id, user_id, lock=True)
    item = (
        await db.execute(
            select(DemoBatchItem)
            .where(DemoBatchItem.batch_id == batch_id, DemoBatchItem.item_ref == item_ref)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="演示项不存在")
    if batch.status in {"completed", "cancelled", "error"}:
        if request.event_seq <= item.event_seq:
            return DemoBatchItemResponse.model_validate(item)
        raise HTTPException(status_code=409, detail="当前批量演示已结束")
    if _ensure_event_seq(item.event_seq, request.event_seq):
        return DemoBatchItemResponse.model_validate(item)
    _ensure_transition(item.status, request.status, ITEM_TRANSITIONS)
    if request.status == "played" and not request.simulated_outcome:
        raise HTTPException(status_code=422, detail="已演示项目必须声明模拟案例类型")
    item.event_seq = request.event_seq
    item.status = request.status
    item.simulated_outcome = request.simulated_outcome
    if request.status == "playing" and not item.started_at:
        item.started_at = datetime.now()
    if request.status in {"played", "skipped", "error"}:
        item.finished_at = datetime.now()
    await db.flush()
    items = await _locked_batch_items(db, batch.id)
    _apply_batch_item_counts(batch, _batch_item_counts(items))
    await db.commit()
    await db.refresh(item)
    return DemoBatchItemResponse.model_validate(item)


async def finish_demo_batch(
    db: AsyncSession,
    batch_id: str,
    request: DemoEvent,
    current_user: dict[str, Any],
) -> DemoBatchResponse:
    user_id, _, _ = _owner(current_user)
    batch = await _owned_batch(db, batch_id, user_id, lock=True)
    if _ensure_event_seq(batch.event_seq, request.event_seq):
        return await _batch_response(db, batch, include_items=True)
    if batch.status != "running":
        raise HTTPException(status_code=409, detail="当前批量演示不能完成")
    items = await _locked_batch_items(db, batch.id)
    counts = _batch_item_counts(items)
    if counts["queued_count"] or counts["playing_count"]:
        raise HTTPException(status_code=409, detail="仍有演示项未结束")
    batch.event_seq = request.event_seq
    batch.status = "completed"
    _apply_batch_item_counts(batch, counts)
    batch.finished_at = datetime.now()
    await db.commit()
    await db.refresh(batch)
    return await _batch_response(db, batch, include_items=True)
