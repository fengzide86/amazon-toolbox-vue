"""Application service for the live B-side batch workspace.

The router deliberately delegates reads, state transitions, and transaction
ownership here so HTTP concerns stay separate from automation state.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from domains.catalog import force_demo_only_tool_configs, normalize_tool_configs
from models import AutomationBatch, AutomationBatchItem, Setting
from schemas.business import BatchCreate, BatchFinish, BatchItemUpdate, BatchUpdate

INTERVENTION_MESSAGES = {
    "login": "需要登录客户账号",
    "captcha": "需要完成页面验证码",
    "two_factor": "需要完成二次验证",
    "page_confirmation": "需要确认页面提示",
    "other": "需要人工完成页面操作",
}


def serialize_item(item: AutomationBatchItem) -> dict[str, Any]:
    return {
        "client_item_id": item.client_item_id,
        "account_label_masked": item.account_label_masked,
        "status": item.status,
        "intervention_type": item.intervention_type,
        "customer_message": item.customer_message,
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def serialize_batch(
    batch: AutomationBatch,
    items: Sequence[AutomationBatchItem] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": batch.id,
        "client_batch_id": batch.client_batch_id,
        "tool_id": batch.tool_id,
        "tool_name": batch.tool_name,
        "status": batch.status,
        "total_count": batch.total_count,
        "pending_count": batch.pending_count,
        "running_count": batch.running_count,
        "waiting_count": batch.waiting_count,
        "completed_count": batch.completed_count,
        "failed_count": batch.failed_count,
        "started_at": batch.started_at.isoformat() if batch.started_at else None,
        "finished_at": batch.finished_at.isoformat() if batch.finished_at else None,
        "last_heartbeat_at": batch.last_heartbeat_at.isoformat() if batch.last_heartbeat_at else None,
    }
    if items is not None:
        data["items"] = [serialize_item(item) for item in items]
    return data


def _mask_label(value: str) -> str:
    normalized = " ".join((value or "").strip().split())[:120]
    if "@" in normalized:
        local, domain = normalized.split("@", 1)
        return f"{local[:2]}***@{domain}"
    if len(normalized) > 6 and not normalized.startswith("客户"):
        return f"{normalized[:2]}***{normalized[-2:]}"
    return normalized


async def _owned_batch(
    db: AsyncSession,
    batch_id: int,
    context: dict[str, Any],
    *,
    lock: bool = False,
) -> AutomationBatch:
    query = select(AutomationBatch).where(
        AutomationBatch.id == batch_id,
        AutomationBatch.auth_code_id == context["auth_code_id"],
        AutomationBatch.device_id == (context.get("device_id") or ""),
    )
    if lock:
        query = query.with_for_update()
    batch = (await db.execute(query)).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次不存在")
    return batch


async def business_tools(db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(select(Setting.value).where(Setting.key == "tool_configs"))
    try:
        tools = json.loads(result.scalar() or "[]")
    except (TypeError, ValueError):
        tools = []
    normalized = normalize_tool_configs(tools)
    if settings.TOOL_EXECUTION_MODE == "demo":
        normalized = force_demo_only_tool_configs(normalized)
        return [
            tool
            for tool in normalized
            if tool.get("availability") == "demo_only" and tool.get("supports_demo_batch")
        ]
    return [tool for tool in normalized if tool.get("supports_live_batch")]


def require_live_batch_write() -> None:
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="FEATURE_DISABLED: 内测版只允许写入演示批次",
        )


async def bootstrap(db: AsyncSession, context: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_type": context["product_type"],
        "entitlements": context["entitlements"],
        "seat_limit": context["auth_code"].seat_limit or 1,
        "tools": await business_tools(db),
    }


async def create_batch(
    db: AsyncSession,
    request: BatchCreate,
    context: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    require_live_batch_write()
    if request.total_count > context["entitlements"]["max_batch_rows"]:
        raise HTTPException(status_code=422, detail="导入数量超过当前授权限制")
    tools = await business_tools(db)
    tool = next((item for item in tools if item["id"] == request.tool_id), None)
    if not tool:
        raise HTTPException(status_code=403, detail="该工具未开放批量执行")
    existing = await db.execute(
        select(AutomationBatch).where(AutomationBatch.client_batch_id == request.client_batch_id)
    )
    batch = existing.scalar_one_or_none()
    if batch:
        if batch.auth_code_id != context["auth_code_id"] or batch.device_id != (context.get("device_id") or ""):
            raise HTTPException(status_code=409, detail="批次标识已被占用")
        return serialize_batch(batch), False
    batch = AutomationBatch(
        client_batch_id=request.client_batch_id,
        auth_code_id=context["auth_code_id"],
        user_id=context.get("user_id"),
        device_id=context.get("device_id") or "unknown",
        tool_id=tool["id"],
        tool_name=tool["name"],
        total_count=request.total_count,
        pending_count=request.total_count,
        status="running",
        last_heartbeat_at=datetime.now(),
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return serialize_batch(batch), True


async def list_batches(
    db: AsyncSession,
    context: dict[str, Any],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(AutomationBatch)
        .where(AutomationBatch.auth_code_id == context["auth_code_id"])
        .order_by(desc(AutomationBatch.created_at))
        .limit(limit)
    )
    return [serialize_batch(item) for item in result.scalars().all()]


async def get_batch(
    db: AsyncSession,
    batch_id: int,
    context: dict[str, Any],
) -> dict[str, Any]:
    batch = await _owned_batch(db, batch_id, context)
    result = await db.execute(
        select(AutomationBatchItem)
        .where(AutomationBatchItem.batch_id == batch.id)
        .order_by(AutomationBatchItem.id)
    )
    return serialize_batch(batch, result.scalars().all())


async def update_batch(
    db: AsyncSession,
    batch_id: int,
    request: BatchUpdate,
    context: dict[str, Any],
) -> dict[str, Any]:
    require_live_batch_write()
    batch = await _owned_batch(db, batch_id, context, lock=True)
    counts = [
        request.pending_count,
        request.running_count,
        request.waiting_count,
        request.completed_count,
        request.failed_count,
    ]
    if sum(counts) > batch.total_count:
        raise HTTPException(status_code=422, detail="批次状态数量超过总数")
    for field in ("pending_count", "running_count", "waiting_count", "completed_count", "failed_count"):
        setattr(batch, field, getattr(request, field))
    if request.status:
        batch.status = request.status
    batch.last_heartbeat_at = datetime.now()
    if batch.status in {"completed", "cancelled", "interrupted"} and not batch.finished_at:
        batch.finished_at = datetime.now()
    await db.commit()
    await db.refresh(batch)
    return serialize_batch(batch)


async def upsert_batch_item(
    db: AsyncSession,
    batch_id: int,
    client_item_id: str,
    request: BatchItemUpdate,
    context: dict[str, Any],
) -> dict[str, Any]:
    require_live_batch_write()
    batch = await _owned_batch(db, batch_id, context, lock=True)
    result = await db.execute(
        select(AutomationBatchItem).where(
            AutomationBatchItem.batch_id == batch.id,
            AutomationBatchItem.client_item_id == client_item_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        item = AutomationBatchItem(
            batch_id=batch.id,
            client_item_id=client_item_id[:100],
            account_label_masked=_mask_label(request.account_label_masked),
        )
        db.add(item)
    item.account_label_masked = _mask_label(request.account_label_masked)
    item.status = request.status
    item.intervention_type = request.intervention_type if request.status == "waiting_user" else None
    item.customer_message = (
        INTERVENTION_MESSAGES.get(request.intervention_type)
        if request.status == "waiting_user"
        else None
    )
    if request.status == "running" and not item.started_at:
        item.started_at = datetime.now()
    if request.status in {"completed", "failed", "cancelled"}:
        item.completed_at = datetime.now()
    batch.last_heartbeat_at = datetime.now()
    await db.commit()
    await db.refresh(item)
    return serialize_item(item)


async def finish_batch(
    db: AsyncSession,
    batch_id: int,
    request: BatchFinish,
    context: dict[str, Any],
) -> dict[str, Any]:
    require_live_batch_write()
    batch = await _owned_batch(db, batch_id, context, lock=True)
    batch.status = request.status
    batch.finished_at = datetime.now()
    batch.last_heartbeat_at = datetime.now()
    await db.commit()
    await db.refresh(batch)
    return serialize_batch(batch)
