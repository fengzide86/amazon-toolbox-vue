"""
数据看板服务模块
包含 Dashboard 统计、图表数据等业务逻辑
支持 Redis 缓存提升性能
"""
import calendar
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.cache import CacheKeys, cache
from core.logging import get_logger
from core.response import success_response
from models import AuthCode, Feedback, Order, Plan, RunLog, User
from models.demo import DemoBatch, DemoRun
from models.feedback import ExecutionVerification

logger = get_logger(__name__)


class DashboardService:
    """数据看板服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_dashboard_stats(self, platform_key: str = None) -> dict[str, Any]:
        """获取数据总览（带缓存）"""
        # 尝试缓存（按平台区分）
        cache_key = CacheKeys.dashboard_stats(platform_key)
        cached = await cache.get(cache_key)
        if cached:
            return cached
        
        # 真实执行只统计已核验记录；历史日志不进入真实业务指标。
        run_log_filter = [RunLog.verification_state == ExecutionVerification.VERIFIED]
        demo_run_filter = []
        demo_batch_filter = []
        feedback_filter = []
        if platform_key:
            from sqlalchemy import or_
            platform_cond = or_(RunLog.platform_key == platform_key, RunLog.platform_key.is_(None))
            run_log_filter.append(platform_cond)
            demo_run_filter.append(DemoRun.platform_key == platform_key)
            demo_batch_filter.append(DemoBatch.platform_key == platform_key)
            feedback_cond = or_(Feedback.platform_key == platform_key, Feedback.platform_key.is_(None))
            feedback_filter.append(feedback_cond)
        
        # 构建订单/授权码平台过滤条件
        order_filter = []
        auth_code_filter = []
        if platform_key:
            from sqlalchemy import or_
            order_filter.append(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
            auth_code_filter.append(or_(AuthCode.platform_scope.contains(platform_key), AuthCode.platform_scope.is_(None)))
        
        # 总收入（按平台过滤）
        revenue_query = select(func.sum(Order.amount)).where(Order.status == "paid")
        for cond in order_filter:
            revenue_query = revenue_query.where(cond)
        revenue_result = await self.db.execute(revenue_query)
        total_revenue = revenue_result.scalar() or 0
        
        # 总订单数（按平台过滤）
        orders_query = select(func.count(Order.id))
        for cond in order_filter:
            orders_query = orders_query.where(cond)
        orders_result = await self.db.execute(orders_query)
        total_orders = orders_result.scalar() or 0
        
        # 活跃授权码数
        active_codes_query = select(func.count(AuthCode.id)).where(AuthCode.status == "active")
        for cond in auth_code_filter:
            active_codes_query = active_codes_query.where(cond)
        active_codes_result = await self.db.execute(active_codes_query)
        active_codes = active_codes_result.scalar() or 0
        
        # 总用户数
        users_result = await self.db.execute(select(func.count(User.id)))
        total_users = users_result.scalar() or 0
        
        # 今日运行次数（按平台过滤）
        today = datetime.now().date()
        today_query = select(func.count(RunLog.id)).where(func.date(RunLog.created_at) == today)
        for cond in run_log_filter:
            today_query = today_query.where(cond)
        today_runs_result = await self.db.execute(today_query)
        today_runs = today_runs_result.scalar() or 0

        # 演示指标与真实执行独立，只表示流程播放活动。
        today_demo_runs_query = select(func.count(DemoRun.id)).where(func.date(DemoRun.created_at) == today)
        today_demo_batches_query = select(func.count(DemoBatch.id)).where(func.date(DemoBatch.created_at) == today)
        for cond in demo_run_filter:
            today_demo_runs_query = today_demo_runs_query.where(cond)
        for cond in demo_batch_filter:
            today_demo_batches_query = today_demo_batches_query.where(cond)
        today_demo_runs = (await self.db.execute(today_demo_runs_query)).scalar() or 0
        today_demo_batches = (await self.db.execute(today_demo_batches_query)).scalar() or 0
        
        # 待处理工单数（按平台过滤）
        pending_query = select(func.count(Feedback.id)).where(Feedback.status == "pending")
        for cond in feedback_filter:
            pending_query = pending_query.where(cond)
        pending_result = await self.db.execute(pending_query)
        pending_tickets = pending_result.scalar() or 0
        
        # 最近运行日志（按平台过滤）
        logs_query = select(RunLog).order_by(desc(RunLog.created_at)).limit(10)
        for cond in run_log_filter:
            logs_query = logs_query.where(cond)
        logs_result = await self.db.execute(logs_query)
        recent_logs = [
            {
                "id": log.id, "tool_name": log.tool_name, "module": log.module,
                "status": log.status, "created_at": log.created_at.isoformat() if log.created_at else None,
                "platform_key": getattr(log, 'platform_key', None),
            }
            for log in logs_result.scalars().all()
        ]
        
        result = success_response(data={
            "total_revenue": float(total_revenue),
            "total_orders": total_orders,
            "active_codes": active_codes,
            "total_users": total_users,
            "today_runs": today_runs,
            "real_execution": {"today_count": today_runs, "recent": recent_logs},
            "demo_activity": {
                "today_single_count": today_demo_runs,
                "today_batch_count": today_demo_batches,
            },
            "pending_tickets": pending_tickets,
            "recent_logs": recent_logs,
        })
        
        # 缓存60秒
        await cache.set(cache_key, result, ttl=60)
        
        return result
    
    async def get_dashboard_charts(self, platform_key: str = None) -> dict[str, Any]:
        """获取图表数据（带缓存）"""
        # 尝试缓存（按平台区分）
        cache_key = CacheKeys.dashboard_charts(platform_key)
        cached = await cache.get(cache_key)
        if cached:
            return cached
        
        now = datetime.now()
        
        # 收入趋势（近7天）- 按平台过滤
        start_date = (now - timedelta(days=6)).date()
        revenue_where = [
            func.date(Order.created_at) >= start_date,
            Order.status == "paid"
        ]
        if platform_key:
            from sqlalchemy import or_
            revenue_where.append(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
        revenue_result = await self.db.execute(
            select(
                func.date(Order.created_at).label('day'),
                func.coalesce(func.sum(Order.amount), 0).label('total')
            ).where(*revenue_where).group_by(func.date(Order.created_at))
        )
        revenue_by_day = {str(row[0]): float(row[1]) for row in revenue_result.all()}
        
        revenue_trend = []
        for i in range(6, -1, -1):
            day = now - timedelta(days=i)
            day_str = day.strftime('%Y-%m-%d')
            day_name = calendar.day_abbr[day.weekday()]
            amount = revenue_by_day.get(day_str, 0)
            revenue_trend.append({"date": day_name, "amount": amount})
        
        # 套餐分布 - 按平台过滤
        plan_join_cond = (Order.plan_id == Plan.id) & (Order.status == "paid")
        if platform_key:
            from sqlalchemy import or_
            plan_join_cond = plan_join_cond & or_(Order.platform_key == platform_key, Order.platform_key.is_(None))
        plan_dist_result = await self.db.execute(
            select(Plan.name, func.count(Order.id))
            .outerjoin(Order, plan_join_cond)
            .group_by(Plan.id, Plan.name)
        )
        plan_distribution = [
            {"name": name or "未知", "count": count}
            for name, count in plan_dist_result.all()
        ]
        
        # 工具成功率（按平台过滤）
        tool_query = select(
            RunLog.tool_name,
            func.count(RunLog.id),
            func.sum(case((RunLog.status.in_(["success", "succeeded"]), 1), else_=0))
        ).where(
            RunLog.verification_state == ExecutionVerification.VERIFIED
        ).group_by(RunLog.tool_name)
        
        if platform_key:
            from sqlalchemy import or_
            tool_query = tool_query.where(
                or_(RunLog.platform_key == platform_key, RunLog.platform_key.is_(None))
            )
        
        tool_rate_result = await self.db.execute(tool_query)
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
        await cache.set(cache_key, result, ttl=60)
        
        return result
    
    async def invalidate_cache(self):
        """清除看板缓存"""
        await cache.delete_pattern("dashboard:stats:*")
        await cache.delete_pattern("dashboard:charts:*")
