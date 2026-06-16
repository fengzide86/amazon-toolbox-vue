"""
用户 Dashboard 路由模块
提供用户首页所需的综合数据
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from typing import List, Optional

from database import get_db
from models import User, AuthCode, Plan, Device, RunLog, Order, Feedback, Tool
from schemas import UserDashboardResponse
from core.dependencies import get_current_user
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("", response_model=UserDashboardResponse)
async def get_user_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户 Dashboard 数据
    
    返回用户首页所需的所有信息：
    - 用户基本信息
    - 场景模式（比赛期/实训期）
    - 授权状态
    - 套餐信息
    - 指标统计
    - AI 建议
    - 风险提醒
    - 快捷工具
    - 最近订单
    - 最近日志
    """
    user_id = current_user["user_id"]
    auth_code_id = current_user.get("auth_code_id")
    
    # 获取用户信息
    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取授权码信息
    auth_info = None
    plan_info = None
    if auth_code_id:
        auth_result = await db.execute(
            select(AuthCode)
            .options(selectinload(AuthCode.devices))
            .where(AuthCode.id == auth_code_id)
        )
        auth_code = auth_result.scalar_one_or_none()
        
        if auth_code:
            # 计算剩余时间
            remaining_seconds = 0
            if auth_code.expires_at:
                remaining = (auth_code.expires_at - datetime.now()).total_seconds()
                remaining_seconds = max(0, int(remaining))
            
            # 获取套餐信息
            if auth_code.plan_id:
                plan_result = await db.execute(
                    select(Plan).where(Plan.id == auth_code.plan_id)
                )
                plan = plan_result.scalar_one_or_none()
                if plan:
                    plan_info = {
                        "id": plan.id,
                        "name": plan.name,
                        "level": getattr(plan, 'level', 'basic'),
                        "features": plan.features if hasattr(plan, 'features') else []
                    }
            
            auth_info = {
                "code": auth_code.code,
                "status": auth_code.status,
                "expires_at": auth_code.expires_at.isoformat() if auth_code.expires_at else None,
                "remaining_seconds": remaining_seconds,
                "device_limit": auth_code.max_devices if hasattr(auth_code, 'max_devices') else 1,
                "device_used": len(auth_code.devices) if auth_code.devices else 0,
                "seat_limit": getattr(auth_code, 'seat_limit', 1) or 1,
                "seat_used": 1  # 当前用户占用一个席位
            }
    
    # 判断场景模式
    scene = "general"
    if auth_info and auth_info["expires_at"]:
        # 简单判断：如果有效期在6个月以内，可能是比赛期
        expires = datetime.fromisoformat(auth_info["expires_at"])
        days_left = (expires - datetime.now()).days
        if days_left <= 180:
            scene = "competition"
        else:
            scene = "training"
    
    # 计算指标
    # 可用工具数
    tools_result = await db.execute(
        select(func.count(Tool.id)).where(Tool.status == "online")
    )
    available_tools = tools_result.scalar() or 0
    
    # 今日运行数
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    today_logs_result = await db.execute(
        select(func.count(RunLog.id)).where(
            and_(
                RunLog.user_id == user_id,
                RunLog.created_at >= today_start
            )
        )
    )
    today_run_count = today_logs_result.scalar() or 0
    
    # 7日成功率
    week_ago = datetime.now() - timedelta(days=7)
    week_logs_result = await db.execute(
        select(RunLog.status).where(
            and_(
                RunLog.user_id == user_id,
                RunLog.created_at >= week_ago
            )
        )
    )
    week_logs = week_logs_result.all()
    total_week = len(week_logs)
    success_week = sum(1 for log in week_logs if log[0] == "success")
    success_rate_7d = round(success_week / total_week, 2) if total_week > 0 else 0.0
    
    # 待处理工单数
    pending_feedback_result = await db.execute(
        select(func.count(Feedback.id)).where(
            and_(
                Feedback.user_id == user_id,
                Feedback.status.in_(["pending", "processing"])
            )
        )
    )
    pending_feedback_count = pending_feedback_result.scalar() or 0
    
    metrics = {
        "available_tools": available_tools,
        "today_run_count": today_run_count,
        "success_rate_7d": success_rate_7d,
        "pending_feedback_count": pending_feedback_count
    }
    
    # AI 建议
    ai_suggestions = []
    
    # 授权即将过期
    if auth_info and auth_info["remaining_seconds"] < 7 * 24 * 3600:  # 7天内过期
        ai_suggestions.append({
            "type": "renewal",
            "title": "授权即将过期",
            "description": f"您的授权将在 {auth_info['remaining_seconds'] // 86400} 天后过期，建议及时续费",
            "action": {
                "label": "查看套餐",
                "route": "/user/plans"
            }
        })
    
    # 没有运行过工具
    if today_run_count == 0:
        ai_suggestions.append({
            "type": "next_step",
            "title": "开始使用工具",
            "description": "今天还没有运行过工具，去功能入口看看吧",
            "action": {
                "label": "进入功能入口",
                "route": "/user/tools"
            }
        })
    
    # 有失败日志
    failed_logs_result = await db.execute(
        select(func.count(RunLog.id)).where(
            and_(
                RunLog.user_id == user_id,
                RunLog.status == "failed",
                RunLog.created_at >= today_start
            )
        )
    )
    failed_today = failed_logs_result.scalar() or 0
    if failed_today > 0:
        ai_suggestions.append({
            "type": "error_help",
            "title": "有工具运行失败",
            "description": f"今天有 {failed_today} 个工具运行失败，可以查看日志或询问AI",
            "action": {
                "label": "查看日志",
                "route": "/user/logs"
            }
        })
    
    # 有待处理工单
    if pending_feedback_count > 0:
        ai_suggestions.append({
            "type": "feedback",
            "title": "工单处理中",
            "description": f"您有 {pending_feedback_count} 个工单正在处理",
            "action": {
                "label": "查看工单",
                "route": "/user/logs"
            }
        })
    
    # 风险提醒
    risk_alerts = []
    
    if auth_info:
        # 授权即将过期
        if auth_info["remaining_seconds"] < 3 * 24 * 3600:  # 3天内
            risk_alerts.append({
                "type": "auth_expiring",
                "level": "high",
                "message": f"授权将在 {auth_info['remaining_seconds'] // 3600} 小时后过期"
            })
        
        # 设备数接近上限
        if auth_info["device_used"] >= auth_info["device_limit"]:
            risk_alerts.append({
                "type": "device_limit",
                "level": "medium",
                "message": "设备数已达上限"
            })
    
    # 今天失败率较高
    if today_run_count > 0 and failed_today / today_run_count > 0.3:
        risk_alerts.append({
            "type": "high_failure_rate",
            "level": "medium",
            "message": f"今天工具失败率 {int(failed_today / today_run_count * 100)}%"
        })
    
    # 快捷工具
    quick_tools_result = await db.execute(
        select(Tool)
        .where(Tool.status == "online")
        .order_by(Tool.sort_order.asc())
        .limit(6)
    )
    quick_tools = [
        {
            "id": t.id,
            "name": t.name,
            "key": t.key if hasattr(t, 'key') else t.name,
            "icon": t.icon if hasattr(t, 'icon') else None,
            "status": t.status,
            "success_rate_7d": t.success_rate_7d if hasattr(t, 'success_rate_7d') else None
        }
        for t in quick_tools_result.scalars().all()
    ]
    
    # 最近订单
    recent_orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .limit(5)
    )
    recent_orders = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "amount": float(o.amount) if o.amount else 0,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None
        }
        for o in recent_orders_result.scalars().all()
    ]
    
    # 最近日志
    recent_logs_result = await db.execute(
        select(RunLog)
        .where(RunLog.user_id == user_id)
        .order_by(RunLog.created_at.desc())
        .limit(10)
    )
    recent_logs = [
        {
            "id": log.id,
            "tool_name": log.tool_name,
            "module": log.module,
            "status": log.status,
            "error_code": log.error_code,
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
        for log in recent_logs_result.scalars().all()
    ]
    
    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "role": "user"
        },
        "scene": scene,
        "auth": auth_info,
        "plan": plan_info,
        "metrics": metrics,
        "ai_suggestions": ai_suggestions,
        "risk_alerts": risk_alerts,
        "quick_tools": quick_tools,
        "recent_orders": recent_orders,
        "recent_logs": recent_logs
    }