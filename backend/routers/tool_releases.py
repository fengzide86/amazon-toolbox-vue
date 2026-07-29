"""自动化工具版本发布、灰度与回滚管理。"""
import re

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.dependencies import get_current_admin
from core.response import CompatibleResponse, success_response
from database import get_db
from services.tool_release_service import (
    canonical_artifact,
    create_release,
    load_releases,
    rollback_releases,
    save_releases,
)

router = APIRouter()

RELEASE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


def _require_live_tool_stage() -> None:
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "FEATURE_DISABLED",
                "message": "完整内测版仅提供演示流程，真实工具版本发布尚未开放",
            },
        )


@router.get("", response_model=CompatibleResponse)
async def list_tool_releases(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    _require_live_tool_stage()
    return success_response(await load_releases(db))


@router.post("", response_model=CompatibleResponse)
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
    if not RELEASE_ID_PATTERN.fullmatch(str(payload["tool_id"])) or not RELEASE_ID_PATTERN.fullmatch(str(payload["version"])):
        raise HTTPException(status_code=400, detail="tool_id/version 只能包含字母、数字、点、下划线和连字符")
    release_payload = dict(payload)
    if release_payload.get("adapter") is not None:
        release_payload["artifact_url"] = f"/api/tool-releases/{payload['tool_id']}/{payload['version']}/artifact"
    releases = await load_releases(db)
    if any(r.get("tool_id") == payload["tool_id"] and r.get("version") == payload["version"] for r in releases):
        raise HTTPException(status_code=409, detail="该工具版本已存在")
    try:
        release = create_release(release_payload)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    releases.append(release)
    await save_releases(db, releases)
    return success_response(release, "工具版本已创建并签名")


@router.get("/{tool_id}/{version}/artifact", response_model=CompatibleResponse)
async def get_tool_release_artifact(
    tool_id: str,
    version: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve only published declarative JSON; integrity is checked by the signed manifest."""
    _require_live_tool_stage()
    releases = await load_releases(db)
    release = next((
        item for item in releases
        if item.get("tool_id") == tool_id
        and item.get("version") == version
        and item.get("status") == "published"
    ), None)
    if not release or not isinstance(release.get("adapter"), dict):
        raise HTTPException(status_code=404, detail="工具适配器不存在或尚未发布")
    content = canonical_artifact(release["adapter"])
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=300, immutable",
            "ETag": f'"{release.get("artifact_sha256", "")}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/{tool_id}/{version}/publish", response_model=CompatibleResponse)
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


@router.post("/{tool_id}/rollback", response_model=CompatibleResponse)
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
