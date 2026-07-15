"""B 端批量工作台控制面。仅接收脱敏状态，不接收 Excel 原文。"""
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.response import success_response
from database import get_db
from models import AutomationBatch, AutomationBatchItem, Setting
from routers.tools import normalize_tool_configs
from schemas.business import BatchCreate, BatchFinish, BatchItemUpdate, BatchUpdate
from services.entitlement_service import require_business_access

router = APIRouter()

INTERVENTION_MESSAGES = {
    "login": "需要登录客户账号",
    "captcha": "需要完成页面验证码",
    "two_factor": "需要完成二次验证",
    "page_confirmation": "需要确认页面提示",
    "other": "需要人工完成页面操作",
}


def _serialize_batch(batch: AutomationBatch, items=None) -> dict:
    data = {
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
        data["items"] = [_serialize_item(item) for item in items]
    return data


def _serialize_item(item: AutomationBatchItem) -> dict:
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


def _mask_label(value: str) -> str:
    value = " ".join((value or "").strip().split())[:120]
    if "@" in value:
        local, domain = value.split("@", 1)
        return f"{local[:2]}***@{domain}"
    if len(value) > 6 and not value.startswith("客户"):
        return f"{value[:2]}***{value[-2:]}"
    return value


async def _owned_batch(db: AsyncSession, batch_id: int, context: dict) -> AutomationBatch:
    result = await db.execute(
        select(AutomationBatch).where(
            AutomationBatch.id == batch_id,
            AutomationBatch.auth_code_id == context["auth_code_id"],
            AutomationBatch.device_id == (context.get("device_id") or ""),
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次不存在")
    return batch


async def _business_tools(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Setting.value).where(Setting.key == "tool_configs"))
    try:
        tools = json.loads(result.scalar() or "[]")
    except (TypeError, ValueError):
        tools = []
    return [tool for tool in normalize_tool_configs(tools) if tool.get("supports_batch")]


@router.get("/bootstrap")
async def bootstrap(context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    return success_response({
        "product_type": context["product_type"],
        "entitlements": context["entitlements"],
        "seat_limit": context["auth_code"].seat_limit or 1,
        "tools": await _business_tools(db),
    })


@router.get("/tools")
async def get_tools(_context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    return success_response(await _business_tools(db))


@router.post("/batches")
async def create_batch(req: BatchCreate, context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    if req.total_count > context["entitlements"]["max_batch_rows"]:
        raise HTTPException(status_code=422, detail="导入数量超过当前授权限制")
    tools = await _business_tools(db)
    tool = next((item for item in tools if item["id"] == req.tool_id), None)
    if not tool:
        raise HTTPException(status_code=403, detail="该工具未开放批量执行")
    existing = await db.execute(select(AutomationBatch).where(AutomationBatch.client_batch_id == req.client_batch_id))
    batch = existing.scalar_one_or_none()
    if batch:
        if batch.auth_code_id != context["auth_code_id"] or batch.device_id != (context.get("device_id") or ""):
            raise HTTPException(status_code=409, detail="批次标识已被占用")
        return success_response(_serialize_batch(batch))
    batch = AutomationBatch(
        client_batch_id=req.client_batch_id,
        auth_code_id=context["auth_code_id"],
        user_id=context.get("user_id"),
        device_id=context.get("device_id") or "unknown",
        tool_id=tool["id"],
        tool_name=tool["name"],
        total_count=req.total_count,
        pending_count=req.total_count,
        status="running",
        last_heartbeat_at=datetime.now(),
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return success_response(_serialize_batch(batch), message="批次已创建")


@router.get("/batches")
async def list_batches(
    limit: int = Query(30, ge=1, le=100),
    context: dict = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AutomationBatch)
        .where(AutomationBatch.auth_code_id == context["auth_code_id"])
        .order_by(desc(AutomationBatch.created_at))
        .limit(limit)
    )
    return success_response([_serialize_batch(item) for item in result.scalars().all()])


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: int, context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    batch = await _owned_batch(db, batch_id, context)
    result = await db.execute(
        select(AutomationBatchItem).where(AutomationBatchItem.batch_id == batch.id).order_by(AutomationBatchItem.id)
    )
    return success_response(_serialize_batch(batch, result.scalars().all()))


@router.patch("/batches/{batch_id}")
async def update_batch(req: BatchUpdate, batch_id: int, context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    batch = await _owned_batch(db, batch_id, context)
    counts = [req.pending_count, req.running_count, req.waiting_count, req.completed_count, req.failed_count]
    if sum(counts) > batch.total_count:
        raise HTTPException(status_code=422, detail="批次状态数量超过总数")
    for field in ["pending_count", "running_count", "waiting_count", "completed_count", "failed_count"]:
        setattr(batch, field, getattr(req, field))
    if req.status:
        batch.status = req.status
    batch.last_heartbeat_at = datetime.now()
    if batch.status in {"completed", "cancelled", "interrupted"} and not batch.finished_at:
        batch.finished_at = datetime.now()
    await db.commit()
    return success_response(_serialize_batch(batch))


@router.put("/batches/{batch_id}/items/{client_item_id}")
async def upsert_batch_item(
    req: BatchItemUpdate,
    batch_id: int,
    client_item_id: str,
    context: dict = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
):
    batch = await _owned_batch(db, batch_id, context)
    result = await db.execute(select(AutomationBatchItem).where(
        AutomationBatchItem.batch_id == batch.id,
        AutomationBatchItem.client_item_id == client_item_id,
    ))
    item = result.scalar_one_or_none()
    if not item:
        item = AutomationBatchItem(
            batch_id=batch.id,
            client_item_id=client_item_id[:100],
            account_label_masked=_mask_label(req.account_label_masked),
        )
        db.add(item)
    item.account_label_masked = _mask_label(req.account_label_masked)
    item.status = req.status
    item.intervention_type = req.intervention_type if req.status == "waiting_user" else None
    item.customer_message = INTERVENTION_MESSAGES.get(req.intervention_type) if req.status == "waiting_user" else None
    if req.status == "running" and not item.started_at:
        item.started_at = datetime.now()
    if req.status in {"completed", "failed", "cancelled"}:
        item.completed_at = datetime.now()
    batch.last_heartbeat_at = datetime.now()
    await db.commit()
    await db.refresh(item)
    return success_response(_serialize_item(item))


@router.post("/batches/{batch_id}/finish")
async def finish_batch(req: BatchFinish, batch_id: int, context: dict = Depends(require_business_access), db: AsyncSession = Depends(get_db)):
    batch = await _owned_batch(db, batch_id, context)
    batch.status = req.status
    batch.finished_at = datetime.now()
    batch.last_heartbeat_at = datetime.now()
    await db.commit()
    return success_response(_serialize_batch(batch), message="批次已结束")
