"""Verified real-execution records reported with a consumed launch grant."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.dependencies import get_current_user
from core.response import CompatibleResponse, success_response
from database import get_db
from domains.catalog.tool_config import normalize_tool_configs
from models import LaunchToken, Setting
from models.feedback import ExecutionVerification, LogStatus, RunLog

router = APIRouter()


class RunnerExecutionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=255)
    run_id: str = Field(min_length=1, max_length=120)
    status: str = Field(pattern="^(succeeded|failed)$")
    error_code: str | None = Field(default=None, max_length=100)
    adapter_version: str | None = Field(default=None, max_length=50)
    page_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    page_changed: bool = False
    completed_steps: int = Field(default=0, ge=0, le=500)


@router.post("/report", response_model=CompatibleResponse)
async def report_execution(req: RunnerExecutionReport, db: AsyncSession = Depends(get_db)):
    """Accept one sanitized terminal report for a consumed single-run grant."""
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(status_code=409, detail="FEATURE_DISABLED: 当前为演示模式")
    result = await db.execute(select(LaunchToken).where(LaunchToken.token == req.token).with_for_update())
    launch = result.scalar_one_or_none()
    if not launch:
        raise HTTPException(status_code=404, detail="启动授权不存在")
    if launch.execution_mode != "single":
        raise HTTPException(status_code=409, detail="批量任务应由批次接口同步")
    if launch.status == "reported":
        return success_response({"accepted": True, "duplicate": True})
    if launch.status != "used" or not launch.used_at:
        raise HTTPException(status_code=409, detail="启动授权尚未被本地 Runner 验证")
    if launch.used_at < datetime.now() - timedelta(hours=24):
        raise HTTPException(status_code=410, detail="执行结果上报时间已过")

    setting_result = await db.execute(select(Setting.value).where(Setting.key == "tool_configs"))
    try:
        tools = normalize_tool_configs(json.loads(setting_result.scalar() or "[]"))
    except (TypeError, ValueError):
        tools = []
    tool = next((item for item in tools if item.get("id") == launch.tool_id), {})
    detail = json.dumps({
        "run_id": req.run_id,
        "adapter_version": req.adapter_version,
        "page_fingerprint": req.page_fingerprint,
        "page_changed": req.page_changed,
        "completed_steps": req.completed_steps,
    }, ensure_ascii=False)
    log = RunLog(
        user_id=launch.user_id,
        auth_code_id=launch.auth_code_id,
        device_id=launch.device_id,
        platform_key=launch.platform_key,
        tool_id=launch.tool_id,
        tool_name=tool.get("name") or launch.tool_id,
        module=tool.get("module"),
        capability_key=tool.get("capability_key"),
        script_key=launch.script_key,
        status=LogStatus.SUCCESS if req.status == "succeeded" else LogStatus.FAILED,
        error_code=req.error_code,
        detail=detail,
        verification_state=ExecutionVerification.VERIFIED,
    )
    db.add(log)
    launch.status = "reported"
    await db.commit()
    await db.refresh(log)
    return success_response({"accepted": True, "duplicate": False, "execution_id": log.id})


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


@router.get("", response_model=CompatibleResponse)
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


@router.get("/{execution_id}", response_model=CompatibleResponse)
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
