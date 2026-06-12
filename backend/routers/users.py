"""
用户管理路由模块（优化版）
使用服务层 + 统一响应格式 + 分页
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from schemas import UserUpdate
from core.dependencies import get_current_admin
from core.pagination import PaginationParams
from services.user_service import UserService

router = APIRouter()


@router.get("")
async def get_users(
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取用户列表（支持搜索和分页）"""
    service = UserService(db)
    pagination = PaginationParams(page=page, page_size=page_size)
    return await service.get_users_list(keyword=keyword, pagination=pagination)


@router.get("/stats")
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取用户统计"""
    service = UserService(db)
    return await service.get_user_stats()


@router.get("/{user_id}")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取用户详情"""
    service = UserService(db)
    return await service.get_user_by_id(user_id)


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    req: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """更新用户信息"""
    service = UserService(db)
    return await service.update_user(user_id, req.model_dump(exclude_none=True))


@router.get("/{user_id}/devices")
async def get_user_devices(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取用户的设备列表"""
    service = UserService(db)
    return await service.get_user_devices(user_id)