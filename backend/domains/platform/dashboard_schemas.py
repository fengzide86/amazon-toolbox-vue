from __future__ import annotations

from pydantic import BaseModel

from core.response import APIResponse


class DashboardRecentLog(BaseModel):
    id: int
    tool_name: str | None = None
    module: str | None = None
    status: str | None = None
    created_at: str | None = None
    platform_key: str | None = None


class DashboardRealExecution(BaseModel):
    today_count: int
    recent: list[DashboardRecentLog]


class DashboardDemoActivity(BaseModel):
    today_single_count: int
    today_batch_count: int


class DashboardStats(BaseModel):
    total_revenue: float
    total_orders: int
    active_codes: int
    total_users: int
    today_runs: int
    real_execution: DashboardRealExecution
    demo_activity: DashboardDemoActivity
    pending_tickets: int
    recent_logs: list[DashboardRecentLog]


class DashboardStatsResponse(APIResponse[DashboardStats]):
    pass


class DashboardRevenuePoint(BaseModel):
    date: str
    amount: float


class DashboardPlanPoint(BaseModel):
    name: str
    count: int


class DashboardToolRate(BaseModel):
    name: str
    rate: int


class DashboardCharts(BaseModel):
    revenue_trend: list[DashboardRevenuePoint]
    plan_distribution: list[DashboardPlanPoint]
    tool_success_rate: list[DashboardToolRate]


class DashboardChartsResponse(APIResponse[DashboardCharts]):
    pass


class DashboardRefreshResponse(BaseModel):
    success: bool
    message: str
