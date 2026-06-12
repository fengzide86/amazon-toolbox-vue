"""
套餐管理路由模块（优化版）
使用服务层 + 统一响应格式 + 缓存
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from core.dependencies import get_current_admin, get_optional_current_user
from core.pagination import PaginationParams
from services.plan_service import PlanService

router = APIRouter()


@router.get("")
async def get_plans(
    status: Optional[str] = Query(None, description="状态过滤"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_optional_current_user)
):
    """获取套餐列表（所有用户可用）"""
    service = PlanService(db)
    return await service.get_plans_list(status=status)


@router.get("/admin")
async def get_plans_admin(
    status: Optional[str] = Query(None, description="状态过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取套餐列表（管理员，带分页）"""
    service = PlanService(db)
    pagination = PaginationParams(page=page, page_size=page_size)
    return await service.get_plans_list(status=status, pagination=pagination)


@router.get("/{plan_id}")
async def get_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_optional_current_user)
):
    """获取套餐详情"""
    service = PlanService(db)
    return await service.get_plan_by_id(plan_id)


@router.post("")
async def create_plan(
    plan_data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """创建套餐"""
    service = PlanService(db)
    return await service.create_plan(plan_data)


@router.put("/{plan_id}")
async def update_plan(
    plan_id: int,
    plan_data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """更新套餐"""
    service = PlanService(db)
    return await service.update_plan(plan_id, plan_data)


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """删除套餐（软删除）"""
    service = PlanService(db)
    return await service.delete_plan(plan_id)


@router.get("/{plan_id}/stats")
async def get_plan_stats(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取套餐统计信息"""
    service = PlanService(db)
    return await service.get_plan_stats(plan_id)