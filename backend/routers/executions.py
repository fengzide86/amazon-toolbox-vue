"""Read-only, verified real-execution records.

The internal demo build deliberately exposes no write endpoint. A future
Runner-specific authenticated API must be designed before a record can enter
this collection.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models.feedback import ExecutionVerification, RunLog

router = APIRouter()


def _owner_id(current_user: dict) -> int:
    user_id = current_user.get("user_id")
    if not isinstance(user_id, int) or user_id <= 0:
        raise HTTPException(status_code=403, detail="真实执行记录仅对授权用户开放")
    return user_id


def _serialize(log: RunLog) -> dict:
    status_map = {
        "success": "succeeded",
        "failed": "failed",
    }
    verification_map = {
        ExecutionVerification.VERIFIED: "verified",
        ExecutionVerification.INCONCLUSIVE: "inconclusive",
    }
    return {
        "id": log.id,
        "record_kind": "live",
        "status": status_map.get(log.status or "", log.status or "inconclusive"),
        "verification": verification_map.get(log.verification_state, "unverified"),
        "tool_id": log.tool_id,
        "tool_name": log.tool_name,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "detail": log.detail,
        "error_code": log.error_code,
    }


@router.get("")
async def list_executions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    platform_key: str | None = Query(default=None, max_length=50),
    tool_id: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = _owner_id(current_user)
    conditions = [
        RunLog.user_id == user_id,
        RunLog.verification_state == ExecutionVerification.VERIFIED,
    ]
    if platform_key:
        conditions.append(RunLog.platform_key == platform_key)
    if tool_id:
        conditions.append(RunLog.tool_id == tool_id)
    total = (await db.execute(select(func.count(RunLog.id)).where(*conditions))).scalar() or 0
    records = (
        await db.execute(
            select(RunLog)
            .where(*conditions)
            .order_by(RunLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return {
        "data": [_serialize(record) for record in records],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{execution_id}")
async def get_execution(
    execution_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    record = (
        await db.execute(
            select(RunLog).where(
                RunLog.id == execution_id,
                RunLog.user_id == _owner_id(current_user),
                RunLog.verification_state == ExecutionVerification.VERIFIED,
            )
        )
    ).scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="真实执行记录不存在")
    return _serialize(record)
