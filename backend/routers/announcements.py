"""公告管理与用户消息中心路由。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_user
from core.response import success_response
from database import get_db
from domains.announcements import service
from domains.announcements.schemas import AnnouncementCreate, AnnouncementUpdate
from models import Announcement

router = APIRouter()


@router.get("")
async def list_announcements(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    return success_response(data=await service.list_admin(db, status))


@router.get("/active")
async def get_active_announcements(db: AsyncSession = Depends(get_db)) -> object:
    """兼容旧客户端：只返回面向所有人的有效公告。"""
    return success_response(data=await service.list_legacy_active(db))


@router.get("/feed")
async def get_announcement_feed(
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.feed(db, current_user))


@router.get("/release-notes/{version}")
async def get_release_notes(
    version: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.release_notes(db, version, current_user))


@router.post("/{announcement_id}/read")
async def mark_announcement_read(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.record_receipt(db, announcement_id, current_user, "read"))


@router.post("/{announcement_id}/dismiss")
async def dismiss_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, object] = Depends(get_current_user),
) -> object:
    return success_response(data=await service.record_receipt(db, announcement_id, current_user, "dismiss"))


@router.post("")
async def create_announcement(
    data: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    announcement = await service.create(db, data)
    return success_response(data=service.serialize(announcement), message="公告已创建")


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    announcement = await service.update(db, announcement_id, data)
    return success_response(data=service.serialize(announcement), message="公告已更新")


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, object] = Depends(get_current_admin),
) -> object:
    result = await db.execute(select(Announcement).where(Announcement.id == announcement_id))
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    await db.delete(announcement)
    await db.commit()
    return success_response(message="公告已删除")
