"""自动化工具版本发布、灰度与回滚管理。"""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.dependencies import get_current_admin
from core.response import success_response
from database import get_db
from services.tool_release_service import (
    create_release,
    load_releases,
    rollback_releases,
    save_releases,
)

router = APIRouter()


def _require_live_tool_stage() -> None:
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "FEATURE_DISABLED",
                "message": "完整内测版仅提供演示流程，真实工具版本发布尚未开放",
            },
        )


@router.get("")
async def list_tool_releases(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    _require_live_tool_stage()
    return success_response(await load_releases(db))


@router.post("")
async def add_tool_release(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    _require_live_tool_stage()
    required = ["tool_id", "version", "script_key"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        raise HTTPException(status_code=400, detail=f"缺少字段: {', '.join(missing)}")
    releases = await load_releases(db)
    if any(r.get("tool_id") == payload["tool_id"] and r.get("version") == payload["version"] for r in releases):
        raise HTTPException(status_code=409, detail="该工具版本已存在")
    try:
        release = create_release(payload)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    releases.append(release)
    await save_releases(db, releases)
    return success_response(release, "工具版本已创建并签名")


@router.post("/{tool_id}/{version}/publish")
async def publish_tool_release(
    tool_id: str,
    version: str,
    payload: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    _require_live_tool_stage()
    releases = await load_releases(db)
    release = next((r for r in releases if r.get("tool_id") == tool_id and r.get("version") == version), None)
    if not release:
        raise HTTPException(status_code=404, detail="工具版本不存在")
    channel = payload.get("channel", "canary")
    if channel not in ["stable", "canary"]:
        raise HTTPException(status_code=400, detail="channel 必须是 stable 或 canary")
    rollout = int(payload.get("rollout_percentage", 100 if channel == "stable" else 10))
    if not 0 <= rollout <= 100:
        raise HTTPException(status_code=400, detail="rollout_percentage 必须在 0-100")
    if channel == "stable":
        for item in releases:
            if item.get("tool_id") == tool_id and item.get("channel") == "stable" and item.get("status") == "published":
                item["status"] = "retired"
    release.update(status="published", channel=channel, rollout_percentage=rollout)
    await save_releases(db, releases)
    return success_response(release, "工具版本已发布")


@router.post("/{tool_id}/rollback")
async def rollback_tool_release(
    tool_id: str,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    _require_live_tool_stage()
    target_version = payload.get("target_version")
    if not target_version:
        raise HTTPException(status_code=400, detail="缺少 target_version")
    releases = await load_releases(db)
    try:
        rollback_releases(releases, tool_id, target_version)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    await save_releases(db, releases)
    target = next(r for r in releases if r.get("tool_id") == tool_id and r.get("version") == target_version)
    return success_response(target, "工具版本已回滚")
