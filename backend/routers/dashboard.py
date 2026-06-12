"""
数据看板路由模块（优化版）
使用服务层 + 统一响应格式 + 缓存
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from core.dependencies import get_current_admin
from services.dashboard_service import DashboardService

router = APIRouter()


@router.get("")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """数据总览 - 返回关键业务指标的汇总数据"""
    service = DashboardService(db)
    return await service.get_dashboard_stats()


@router.get("/charts")
async def get_dashboard_charts(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取图表数据 - 包含收入趋势、套餐分布、工具成功率"""
    service = DashboardService(db)
    return await service.get_dashboard_charts()


@router.post("/refresh-cache")
async def refresh_dashboard_cache(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """手动刷新看板缓存"""
    service = DashboardService(db)
    await service.invalidate_cache()
    return {"success": True, "message": "看板缓存已刷新"}