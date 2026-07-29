"""公告管理与用户消息中心路由。"""
from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.dependencies import get_current_admin, get_current_user
from core.deprecation import log_deprecated_api_call
from core.response import CompatibleResponse, success_response
from database import get_db
from domains.announcements import service
from domains.announcements.schemas import AnnouncementCreate, AnnouncementUpdate
from models import Announcement

router = APIRouter()


@router.get("", response_model=CompatibleResponse)
async def list_announcements(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    return success_response(data=await service.list_admin(db, status))


@router.get("/active", response_model=CompatibleResponse)
async def get_active_announcements(request: Request, db: AsyncSession = Depends(get_db)) -> object:
    """兼容旧客户端：只返回面向所有人的有效公告。"""
    log_deprecated_api_call(request, "/api/announcements/active")
    return success_response(data=await service.list_legacy_active(db))


@router.get("/feed", response_model=CompatibleResponse)
async def get_announcement_feed(
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.feed(db, current_user))


@router.get("/release-notes/{version}", response_model=CompatibleResponse)
async def get_release_notes(
    version: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.release_notes(db, version, current_user))


@router.post("/{announcement_id}/read", response_model=CompatibleResponse)
async def mark_announcement_read(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.record_receipt(db, announcement_id, current_user, "read"))


@router.post("/{announcement_id}/dismiss", response_model=CompatibleResponse)
async def dismiss_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.record_receipt(db, announcement_id, current_user, "dismiss"))


@router.post("", response_model=CompatibleResponse)
async def create_announcement(
    data: AnnouncementCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, object] = Depends(get_current_admin),
) -> object:
    announcement = await service.create(db, data, actor=actor, request=request)
    return success_response(data=service.serialize(announcement), message="公告已创建")


@router.put("/{announcement_id}", response_model=CompatibleResponse)
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, object] = Depends(get_current_admin),
) -> object:
    announcement = await service.update(
        db,
        announcement_id,
        data,
        actor=actor,
        request=request,
    )
    return success_response(data=service.serialize(announcement), message="公告已更新")


@router.delete("/{announcement_id}", response_model=CompatibleResponse)
async def delete_announcement(
    announcement_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, object] = Depends(get_current_admin),
) -> object:
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    before = service.serialize(announcement)
    await db.delete(announcement)
    await log_admin_action(
        db,
        user_id=cast(int | None, actor.get("staff_id")),
        user_name=cast(str | None, actor.get("username")),
        action="announcement_delete",
        target_type="announcement",
        target_id=announcement.id,
        detail={
            "role": actor.get("role"),
            "before": before,
            "after": {"deleted": True},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    return success_response(message="公告已删除")
