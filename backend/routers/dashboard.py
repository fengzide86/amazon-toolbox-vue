"""
数据看板路由模块（优化版）
使用服务层 + 统一响应格式 + 缓存
"""

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from domains.platform import DashboardService
from domains.platform.dashboard_schemas import (
    DashboardChartsResponse,
    DashboardRefreshResponse,
    DashboardStatsResponse,
)

router = APIRouter()


@router.get("", response_model=DashboardStatsResponse)
async def get_dashboard(
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """数据总览 - 返回关键业务指标的汇总数据"""
    service = DashboardService(db)
    return await service.get_dashboard_stats(platform_key=platform_key)


@router.get("/charts", response_model=DashboardChartsResponse)
async def get_dashboard_charts(
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """获取图表数据 - 包含收入趋势、套餐分布、工具成功率"""
    service = DashboardService(db)
    return await service.get_dashboard_charts(platform_key=platform_key)


@router.post("/refresh-cache", response_model=DashboardRefreshResponse)
async def refresh_dashboard_cache(
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, bool | str]:
    """手动刷新看板缓存"""
    service = DashboardService(db)
    await service.invalidate_cache(actor=actor, request=request)
    return {"success": True, "message": "看板缓存已刷新"}
