"""
工单反馈路由模块（优化版）
使用服务层 + 统一响应格式 + 分页
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from schemas import FeedbackCreate, FeedbackUpdate
from core.dependencies import get_current_admin, get_current_user
from core.pagination import PaginationParams
from services.feedback_service import FeedbackService

router = APIRouter()


@router.get("")
async def get_feedback_list(
    status: Optional[str] = Query(None, description="状态过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取工单列表（管理员，带分页）"""
    service = FeedbackService(db)
    pagination = PaginationParams(page=page, page_size=page_size)
    return await service.get_feedback_list(status=status, pagination=pagination)


@router.get("/stats")
async def get_feedback_stats(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取工单统计"""
    service = FeedbackService(db)
    return await service.get_feedback_stats()


@router.get("/my")
async def get_my_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取我的工单列表（用户）"""
    service = FeedbackService(db)
    pagination = PaginationParams(page=page, page_size=page_size)
    return await service.get_feedback_list(
        user_id=current_user.get("user_id"),
        pagination=pagination
    )


@router.get("/{feedback_id}")
async def get_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取工单详情"""
    service = FeedbackService(db)
    return await service.get_feedback_by_id(feedback_id)


@router.post("")
async def create_feedback(
    req: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """创建工单"""
    service = FeedbackService(db)
    data = req.model_dump()
    data["user_id"] = current_user.get("user_id")
    return await service.create_feedback(data)


@router.put("/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    req: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """更新工单（管理员回复等）"""
    service = FeedbackService(db)
    return await service.update_feedback(feedback_id, req.model_dump(exclude_none=True))


@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """删除工单"""
    service = FeedbackService(db)
    return await service.delete_feedback(feedback_id)