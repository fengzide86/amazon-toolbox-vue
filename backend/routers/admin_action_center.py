"""管理端行动中心。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from core.response import success_response
from database import get_db
from models import AuthCode, AuthSeat, AutomationBatch, AutomationBatchItem, Device, Feedback

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

    waiting_result = await db.execute(
        select(AutomationBatchItem, AutomationBatch)
        .join(AutomationBatch, AutomationBatch.id == AutomationBatchItem.batch_id)
        .where(AutomationBatchItem.status == "waiting_user")
        .order_by(AutomationBatchItem.updated_at)
        .limit(30)
    )
    waiting = waiting_result.all()

    stale_before = now - timedelta(seconds=90)
    stale_result = await db.execute(
        select(AutomationBatch).where(
            AutomationBatch.status == "running",
            AutomationBatch.last_heartbeat_at < stale_before,
        ).order_by(AutomationBatch.last_heartbeat_at).limit(20)
    )
    stale = stale_result.scalars().all()

    return success_response({
        "summary": {
            "expiring_authorizations": len(expiring),
            "device_anomalies": len(anomalies),
            "pending_tickets": len(tickets),
            "waiting_interventions": len(waiting),
            "stale_batches": len(stale),
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
        "waiting_interventions": [{
            "batch_id": batch.id,
            "tool_name": batch.tool_name,
            "account_label_masked": item.account_label_masked,
            "intervention_type": item.intervention_type,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        } for item, batch in waiting],
        "stale_batches": [{
            "batch_id": item.id,
            "tool_name": item.tool_name,
            "last_heartbeat_at": item.last_heartbeat_at.isoformat() if item.last_heartbeat_at else None,
        } for item in stale],
    })


@router.get("/business-batches/{batch_id}")
async def get_business_batch(batch_id: int, _admin: dict = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AutomationBatch).where(AutomationBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    items_result = await db.execute(
        select(AutomationBatchItem).where(AutomationBatchItem.batch_id == batch.id).order_by(AutomationBatchItem.id)
    )
    return success_response({
        "id": batch.id,
        "tool_name": batch.tool_name,
        "status": batch.status,
        "total_count": batch.total_count,
        "last_heartbeat_at": batch.last_heartbeat_at.isoformat() if batch.last_heartbeat_at else None,
        "items": [{
            "account_label_masked": item.account_label_masked,
            "status": item.status,
            "intervention_type": item.intervention_type,
            "customer_message": item.customer_message,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        } for item in items_result.scalars().all()],
    })
