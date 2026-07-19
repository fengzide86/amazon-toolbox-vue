"""管理端行动中心。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from core.response import success_response
from database import get_db
from models import AuthCode, AuthSeat, Device, Feedback

router = APIRouter()


@router.get("/action-center")
async def get_action_center(
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now()
    expiry_limit = now + timedelta(days=7)
    expiring_result = await db.execute(
        select(AuthCode).where(
            AuthCode.status.in_(["active", "unused"]),
            AuthCode.expires_at.is_not(None),
            AuthCode.expires_at >= now,
            AuthCode.expires_at <= expiry_limit,
        ).order_by(AuthCode.expires_at).limit(20)
    )
    expiring = expiring_result.scalars().all()

    seat_counts = select(AuthSeat.auth_code_id, func.count(AuthSeat.id).label("used")).where(
        AuthSeat.status == "active"
    ).group_by(AuthSeat.auth_code_id).subquery()
    device_counts = select(Device.auth_code_id, func.count(Device.id).label("used")).group_by(
        Device.auth_code_id
    ).subquery()
    anomaly_result = await db.execute(
        select(AuthCode, func.coalesce(seat_counts.c.used, 0), func.coalesce(device_counts.c.used, 0))
        .outerjoin(seat_counts, AuthCode.id == seat_counts.c.auth_code_id)
        .outerjoin(device_counts, AuthCode.id == device_counts.c.auth_code_id)
        .where(or_(seat_counts.c.used > AuthCode.seat_limit, device_counts.c.used > AuthCode.max_devices))
        .limit(20)
    )
    anomalies = anomaly_result.all()

    feedback_result = await db.execute(
        select(Feedback).where(Feedback.status == "pending").order_by(Feedback.created_at).limit(20)
    )
    tickets = feedback_result.scalars().all()

    return success_response({
        "summary": {
            "expiring_authorizations": len(expiring),
            "device_anomalies": len(anomalies),
            "pending_tickets": len(tickets),
            "waiting_interventions": 0,
            "stale_batches": 0,
        },
        "expiring_authorizations": [{
            "id": item.id,
            "code_masked": f"{item.code[:4]}***{item.code[-3:]}",
            "expires_at": item.expires_at.isoformat() if item.expires_at else None,
        } for item in expiring],
        "device_anomalies": [{
            "auth_code_id": code.id,
            "code_masked": f"{code.code[:4]}***{code.code[-3:]}",
            "seat_used": int(seat_used or 0),
            "seat_limit": code.seat_limit or 1,
            "device_used": int(device_used or 0),
            "device_limit": code.max_devices or 1,
        } for code, seat_used, device_used in anomalies],
        "pending_tickets": [{
            "id": item.id,
            "title": item.title or "用户反馈",
            "priority": item.priority,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        } for item in tickets],
        # Legacy Runner batches are intentionally excluded. Demo metrics live
        # under /api/demo and never masquerade as operational execution alerts.
        "waiting_interventions": [],
        "stale_batches": [],
    })


@router.get("/business-batches/{batch_id}")
async def get_business_batch(batch_id: int, _admin: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    del batch_id, _admin, db
    raise HTTPException(
        status_code=409,
        detail={
            "code": "FEATURE_DISABLED",
            "message": "内部演示版不开放旧 Runner 批次详情",
        },
    )
