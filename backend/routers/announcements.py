"""
公告管理路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional

from database import get_db
from core.dependencies import get_current_admin
from core.response import success_response
from models import Announcement, AnnouncementStatus
from schemas import AnnouncementCreate, AnnouncementUpdate, AnnouncementOut

router = APIRouter()


@router.get("")
async def list_announcements(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取公告列表（管理端）"""
    query = select(Announcement).order_by(desc(Announcement.priority), desc(Announcement.created_at))
    if status:
        query = query.where(Announcement.status == status)
    result = await db.execute(query)
    items = result.scalars().all()
    return success_response(data=[
        {
            "id": a.id,
            "title": a.title,
            "content": a.content,
            "type": a.type,
            "status": a.status,
            "priority": a.priority,
            "expires_at": a.expires_at.isoformat() if a.expires_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in items
    ])


@router.get("/active")
async def get_active_announcements(db: AsyncSession = Depends(get_db)):
    """获取已发布的公告（用户端）"""
    now = datetime.now()
    query = (
        select(Announcement)
        .where(
            Announcement.status == AnnouncementStatus.PUBLISHED,
            (Announcement.expires_at.is_(None)) | (Announcement.expires_at > now)
        )
        .order_by(desc(Announcement.priority), desc(Announcement.created_at))
    )
    result = await db.execute(query)
    items = result.scalars().all()
    return success_response(data=[
        {
            "id": a.id,
            "title": a.title,
            "content": a.content,
            "type": a.type,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in items
    ])


@router.post("")
async def create_announcement(
    data: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin)
):
    """创建公告"""
    ann = Announcement(
        title=data.title,
        content=data.content,
        type=data.type or "info",
        status=data.status or "draft",
        priority=data.priority or 0,
        expires_at=data.expires_at,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return success_response(data={"id": ann.id}, message="公告已创建")


@router.put("/{ann_id}")
async def update_announcement(
    ann_id: int,
    data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin)
):
    """更新公告"""
    result = await db.execute(select(Announcement).where(Announcement.id == ann_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="公告不存在")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ann, field, value)

    await db.commit()
    await db.refresh(ann)
    return success_response(message="公告已更新")


@router.delete("/{ann_id}")
async def delete_announcement(
    ann_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(get_current_admin)
):
    """删除公告"""
    result = await db.execute(select(Announcement).where(Announcement.id == ann_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="公告不存在")

    await db.delete(ann)
    await db.commit()
    return success_response(message="公告已删除")