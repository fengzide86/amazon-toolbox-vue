"""
数据看板路由模块（优化版）
使用服务层 + 统一响应格式 + 缓存
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.dependencies import get_current_admin
from core.response import CompatibleResponse
from database import get_db
from domains.platform import DashboardService

router = APIRouter()


@router.get("", response_model=CompatibleResponse)
async def get_dashboard(
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """数据总览 - 返回关键业务指标的汇总数据"""
    service = DashboardService(db)
    return await service.get_dashboard_stats(platform_key=platform_key)


@router.get("/charts", response_model=CompatibleResponse)
async def get_dashboard_charts(
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取图表数据 - 包含收入趋势、套餐分布、工具成功率"""
    service = DashboardService(db)
    return await service.get_dashboard_charts(platform_key=platform_key)


@router.post("/refresh-cache", response_model=CompatibleResponse)
async def refresh_dashboard_cache(
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_current_admin)
):
    """手动刷新看板缓存"""
    service = DashboardService(db)
    await service.invalidate_cache()
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="dashboard_cache_refresh",
        target_type="dashboard_cache",
        target_id="all",
        detail={
            "role": actor.get("role"),
            "before": {"state": "cached_or_empty"},
            "after": {"state": "invalidated"},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    return {"success": True, "message": "看板缓存已刷新"}
