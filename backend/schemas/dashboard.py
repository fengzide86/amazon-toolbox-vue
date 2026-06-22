"""
看板相关 Schema
"""
from pydantic import BaseModel
from typing import List


class DashboardData(BaseModel):
    total_revenue: float
    total_orders: int
    active_codes: int
    total_users: int
    today_runs: int
    pending_tickets: int
    recent_logs: List[dict]