"""
数据看板服务模块
包含 Dashboard 统计、图表数据等业务逻辑
支持 Redis 缓存提升性能
"""
from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy import select, func, case, desc
from sqlalchemy.ext.asyncio import AsyncSession
import calendar

from models import Order, AuthCode, User, RunLog, Feedback, Plan
from core.logging import get_logger
from core.response import success_response
from core.cache import cache, CacheKeys

logger = get_logger(__name__)


class DashboardService:
    """数据看板服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_dashboard_stats(self) -> Dict[str, Any]:
        """获取数据总览（带缓存）"""
        # 尝试缓存
        cached = await cache.get(CacheKeys.DASHBOARD_STATS)
        if cached:
            return cached
        
        # 总收入
        revenue_result = await self.db.execute(
            select(func.sum(Order.amount)).where(Order.status.in_(["paid", "refunded"]))
        )
        total_revenue = revenue_result.scalar() or 0
        
        # 总订单数
        orders_result = await self.db.execute(select(func.count(Order.id)))
        total_orders = orders_result.scalar() or 0
        
        # 活跃授权码数
        active_codes_result = await self.db.execute(
            select(func.count(AuthCode.id)).where(AuthCode.status == "active")
        )
        active_codes = active_codes_result.scalar() or 0
        
        # 总用户数
        users_result = await self.db.execute(select(func.count(User.id)))
        total_users = users_result.scalar() or 0
        
        # 今日运行次数
        today = datetime.now().date()
        today_runs_result = await self.db.execute(
            select(func.count(RunLog.id)).where(func.date(RunLog.created_at) == today)
        )
        today_runs = today_runs_result.scalar() or 0
        
        # 待处理工单数
        pending_result = await self.db.execute(
            select(func.count(Feedback.id)).where(Feedback.status == "pending")
        )
        pending_tickets = pending_result.scalar() or 0
        
        # 最近运行日志
        logs_result = await self.db.execute(
            select(RunLog).order_by(desc(RunLog.created_at)).limit(10)
        )
        recent_logs = [
            {
                "id": l.id, "tool_name": l.tool_name, "module": l.module,
                "status": l.status, "created_at": l.created_at.isoformat() if l.created_at else None
            }
            for l in logs_result.scalars().all()
        ]
        
        result = success_response(data={
            "total_revenue": float(total_revenue),
            "total_orders": total_orders,
            "active_codes": active_codes,
            "total_users": total_users,
            "today_runs": today_runs,
            "pending_tickets": pending_tickets,
            "recent_logs": recent_logs,
        })
        
        # 缓存60秒
        await cache.set(CacheKeys.DASHBOARD_STATS, result, ttl=60)
        
        return result
    
    async def get_dashboard_charts(self) -> Dict[str, Any]:
        """获取图表数据（带缓存）"""
        # 尝试缓存
        cached = await cache.get(CacheKeys.DASHBOARD_CHARTS)
        if cached:
            return cached
        
        now = datetime.now()
        
        # 收入趋势（近7天）- 使用 GROUP BY 一次性查询，避免 N+1 问题
        start_date = (now - timedelta(days=6)).date()
        revenue_result = await self.db.execute(
            select(
                func.date(Order.created_at).label('day'),
                func.coalesce(func.sum(Order.amount), 0).label('total')
            ).where(
                func.date(Order.created_at) >= start_date,
                Order.status.in_(["paid", "refunded"])
            ).group_by(func.date(Order.created_at))
        )
        revenue_by_day = {str(row[0]): float(row[1]) for row in revenue_result.all()}
        
        revenue_trend = []
        for i in range(6, -1, -1):
            day = now - timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            day_name = calendar.day_abbr[day.weekday()]
            amount = revenue_by_day.get(day_str, 0)
            revenue_trend.append({"date": day_name, "amount": amount})
        
        # 套餐分布
        plan_dist_result = await self.db.execute(
            select(Plan.name, func.count(Order.id))
            .outerjoin(Order, (Order.plan_id == Plan.id) & (Order.status == "paid"))
            .group_by(Plan.id, Plan.name)
        )
        plan_distribution = [
            {"name": name or "未知", "count": count}
            for name, count in plan_dist_result.all()
        ]
        
        # 工具成功率
        tool_rate_result = await self.db.execute(
            select(
                RunLog.tool_name,
                func.count(RunLog.id),
                func.sum(case((RunLog.status == "success", 1), else_=0))
            )
            .group_by(RunLog.tool_name)
        )
        tool_success_rate = []
        for name, total, success_count in tool_rate_result.all():
            rate = round((success_count or 0) / total * 100) if total > 0 else 0
            tool_success_rate.append({"name": name or "未知", "rate": rate})
        
        result = success_response(data={
            "revenue_trend": revenue_trend,
            "plan_distribution": plan_distribution,
            "tool_success_rate": tool_success_rate,
        })
        
        # 缓存60秒
        await cache.set(CacheKeys.DASHBOARD_CHARTS, result, ttl=60)
        
        return result
    
    async def invalidate_cache(self):
        """清除看板缓存"""
        await cache.delete(CacheKeys.DASHBOARD_STATS)
        await cache.delete(CacheKeys.DASHBOARD_CHARTS)