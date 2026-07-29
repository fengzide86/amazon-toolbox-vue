"""Staff-only order queries and explicit transactional state transitions."""

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import require_any_staff, require_commerce_operator
from core.exceptions import ValidationException
from core.response import CompatibleResponse
from database import get_db
from models import Order, OrderStatus
from schemas.order import OrderCreate, OrderTransitionRequest, OrderUpdate
from services.order_service import OrderService

router = APIRouter()


@router.get("", response_model=CompatibleResponse)
async def get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    plan_id: int | None = Query(default=None, gt=0),
    platform_key: str | None = None,
    db: AsyncSession = Depends(get_db),
    _staff: dict = Depends(require_any_staff),
):
    return await OrderService(db).list_orders(
        page,
        page_size,
        status_filter=status_filter,
        plan_id=plan_id,
        platform_key=platform_key,
    )


@router.get("/export", response_model=CompatibleResponse)
async def export_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    start_date: str | None = None,
    end_date: str | None = None,
    platform_key: str | None = None,
    db: AsyncSession = Depends(get_db),
    _staff: dict = Depends(require_any_staff),
):
    filters = []
    if status_filter:
        if status_filter not in OrderStatus.ALL:
            raise ValidationException("订单状态无效")
        filters.append(Order.status == status_filter)
    if platform_key:
        filters.append(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
    if start_date:
        try:
            filters.append(Order.created_at >= datetime.fromisoformat(start_date))
        except ValueError as error:
            raise ValidationException("开始日期格式无效") from error
    if end_date:
        try:
            end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59)
            filters.append(Order.created_at <= end)
        except ValueError as error:
            raise ValidationException("结束日期格式无效") from error
    result = await db.execute(
        select(Order).where(*filters).order_by(desc(Order.created_at)).limit(10000)
    )
    orders = result.scalars().all()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(
        [
            "订单号",
            "套餐快照",
            "金额",
            "渠道",
            "负责人",
            "状态",
            "创建时间",
        "收款时间",
            "退款/取消原因",
        ]
    )
    status_map = {
        OrderStatus.PENDING: "待收款",
        OrderStatus.PAID: "已收款",
        OrderStatus.REFUNDED: "已退款",
        OrderStatus.CANCELLED: "已取消",
    }
    for order in orders:
        writer.writerow(
            [
                order.order_no,
                order.plan_name_snapshot,
                str(order.amount),
                order.channel or "",
                order.responsible or "",
                status_map.get(order.status, order.status),
                order.created_at.strftime("%Y-%m-%d %H:%M:%S") if order.created_at else "",
                order.paid_at.strftime("%Y-%m-%d %H:%M:%S") if order.paid_at else "",
                order.refund_reason or order.cancel_reason or "",
            ]
        )
    output.seek(0)
    filename = f"orders_{datetime.utcnow():%Y%m%d_%H%M%S}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CompatibleResponse)
async def create_order(
    req: OrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_commerce_operator),
):
    order = await OrderService(db).create_order(req.model_dump(), actor, request)
    return {"success": True, "message": "订单已创建", "data": OrderService.serialize(order)}


@router.get("/{order_id}", response_model=CompatibleResponse)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _staff: dict = Depends(require_any_staff),
):
    order = await OrderService(db).get_order(order_id)
    return {"success": True, "message": "ok", "data": OrderService.serialize(order)}


@router.patch("/{order_id}", response_model=CompatibleResponse)
@router.put("/{order_id}", deprecated=True, response_model=CompatibleResponse)
async def update_order(
    order_id: int,
    req: OrderUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_commerce_operator),
):
    order = await OrderService(db).update_pending(
        order_id,
        req.model_dump(exclude_unset=True),
        actor,
        request,
    )
    return {"success": True, "message": "订单已更新", "data": OrderService.serialize(order)}


@router.post("/{order_id}/mark-paid", response_model=CompatibleResponse)
async def mark_order_paid(
    order_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_commerce_operator),
):
    order = await OrderService(db).mark_paid(order_id, actor, request)
    return {"success": True, "message": "订单已确认收款并生成分润", "data": OrderService.serialize(order)}


@router.post("/{order_id}/cancel", response_model=CompatibleResponse)
async def cancel_order(
    order_id: int,
    req: OrderTransitionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_commerce_operator),
):
    order = await OrderService(db).cancel(order_id, req.reason, actor, request)
    return {"success": True, "message": "订单已取消", "data": OrderService.serialize(order)}


@router.post("/{order_id}/refund", response_model=CompatibleResponse)
async def refund_order(
    order_id: int,
    req: OrderTransitionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_commerce_operator),
):
    order = await OrderService(db).refund(order_id, req.reason, actor, request)
    return {"success": True, "message": "订单已退款，分润记录已冲正", "data": OrderService.serialize(order)}
