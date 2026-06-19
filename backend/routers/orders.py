"""
订单管理路由模块
包含订单的创建、查询、更新、退款、导出等接口
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
import uuid
import io
import csv

from database import get_db
from models import Order, ProfitRecord, Setting, Plan
from schemas import OrderCreate, OrderUpdate, OrderResponse
from core.logging import get_logger
from core.exceptions import NotFoundException
from core.config import settings
from core.dependencies import get_current_admin
import json

logger = get_logger(__name__)

router = APIRouter()


async def generate_profit_record(db: AsyncSession, order: Order):
    """根据订单金额自动生成分润记录"""
    amount = float(order.amount)
    result = await db.execute(select(Setting).where(Setting.key == "profit_ratios"))
    setting = result.scalars().first()
    ratios = json.loads(setting.value) if setting and setting.value else settings.DEFAULT_PROFIT_RATIOS
    
    record = ProfitRecord(
        order_id=order.id,
        tech_share=amount * ratios.get("tech", 0.30),
        market_share=amount * ratios.get("market", 0.25),
        product_share=amount * ratios.get("product", 0.15),
        service_share=amount * ratios.get("service", 0.15),
        coordination_share=amount * ratios.get("coordination", 0.10),
        record_share=amount * ratios.get("record", 0.05),
    )
    db.add(record)
    logger.info(f"生成订单 {order.order_no} 的分润记录，金额: {amount}")


@router.get("", response_model=List[OrderResponse])
async def get_orders(page: int = 1, page_size: int = 50, platform_key: str = None, db: AsyncSession = Depends(get_db)):
    """获取订单列表（支持分页和平台过滤）"""
    offset = (page - 1) * page_size
    query = select(Order)
    if platform_key:
        from sqlalchemy import or_
        query = query.where(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
    result = await db.execute(
        query.order_by(desc(Order.created_at)).offset(offset).limit(page_size)
    )
    return result.scalars().all()


@router.post("", response_model=OrderResponse)
async def create_order(req: OrderCreate, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """创建新订单"""
    order_no = f"ORD-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    order = Order(order_no=order_no, **req.model_dump())
    if req.status == "paid":
        order.paid_at = datetime.now()
    db.add(order)
    await db.flush()
    if req.status == "paid":
        await generate_profit_record(db, order)
    await db.commit()
    await db.refresh(order)
    logger.info(f"创建订单: {order.order_no}")
    return order


@router.put("/{order_id}", response_model=OrderResponse)
async def update_order(order_id: int, req: OrderUpdate, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新订单信息"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalars().first()
    if not order:
        raise NotFoundException("订单不存在")
    
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(order, k, v)
    if req.status == "paid" and not order.paid_at:
        order.paid_at = datetime.now()
        await generate_profit_record(db, order)
    await db.commit()
    await db.refresh(order)
    logger.info(f"更新订单: {order.order_no}")
    return order


@router.get("/export")
async def export_orders(
    status: Optional[str] = Query(None, description="状态筛选"),
    start_date: Optional[str] = Query(None, description="开始日期"),
    end_date: Optional[str] = Query(None, description="结束日期"),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """导出订单为 CSV 文件"""
    query = select(Order).order_by(desc(Order.created_at))
    
    if status:
        query = query.where(Order.status == status)
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            query = query.where(Order.created_at >= start)
        except ValueError:
            pass
    if end_date:
        try:
            end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59)
            query = query.where(Order.created_at <= end)
        except ValueError:
            pass
    
    result = await db.execute(query.limit(10000))
    orders = result.scalars().all()
    
    # 获取套餐名称映射
    plan_result = await db.execute(select(Plan))
    plans = {p.id: p.name for p in plan_result.scalars().all()}
    
    # 生成 CSV
    output = io.StringIO()
    output.write('\ufeff')  # BOM for Excel
    writer = csv.writer(output)
    writer.writerow(['订单号', '套餐', '金额', '渠道', '负责人', '状态', '创建时间', '付款时间'])
    
    status_map = {'pending': '待确认', 'paid': '已付款', 'refunded': '已退款'}
    for order in orders:
        writer.writerow([
            order.order_no,
            plans.get(order.plan_id, '未知'),
            float(order.amount),
            order.channel or '',
            order.responsible or '',
            status_map.get(order.status, order.status),
            order.created_at.strftime('%Y-%m-%d %H:%M:%S') if order.created_at else '',
            order.paid_at.strftime('%Y-%m-%d %H:%M:%S') if order.paid_at else ''
        ])
    
    output.seek(0)
    filename = f"orders_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/{order_id}/refund")
async def refund_order(order_id: int, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """订单退款
    
    退款时会同时删除对应的分润记录
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalars().first()
    if not order:
        raise NotFoundException("订单不存在")
    
    order.status = "refunded"
    order.refund_amount = order.amount
    # 回滚分润记录
    await db.execute(delete(ProfitRecord).where(ProfitRecord.order_id == order_id))
    await db.commit()
    logger.info(f"订单退款: {order.order_no}")
    return {"success": True, "order_no": order.order_no}