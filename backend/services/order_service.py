"""
订单服务模块
包含订单 CRUD、统计、分页查询等业务逻辑
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models import Order, Plan, ProfitRecord
from core.logging import get_logger
from core.response import success_response, error_response, ErrorCodes
from core.pagination import PaginationParams, paginate

logger = get_logger(__name__)


class OrderService:
    """订单服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_orders_list(
        self,
        status: Optional[str] = None,
        plan_id: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        pagination: Optional[PaginationParams] = None
    ) -> Dict[str, Any]:
        """获取订单列表（支持过滤和分页）"""
        query = select(Order).order_by(desc(Order.created_at))
        
        # 状态过滤
        if status:
            query = query.where(Order.status == status)
        
        # 套餐过滤
        if plan_id:
            query = query.where(Order.plan_id == plan_id)
        
        # 日期范围过滤
        if start_date:
            query = query.where(func.date(Order.created_at) >= start_date)
        if end_date:
            query = query.where(func.date(Order.created_at) <= end_date)
        
        if pagination:
            items, total = await paginate(query, self.db, pagination)
            return success_response(
                data=[self._serialize_order(o) for o in items],
                total=total,
                page=pagination.page,
                page_size=pagination.page_size,
            )
        else:
            result = await self.db.execute(query)
            orders = result.scalars().all()
            return success_response(
                data=[self._serialize_order(o) for o in orders]
            )
    
    async def get_order_by_id(self, order_id: int) -> Dict[str, Any]:
        """根据 ID 获取订单详情"""
        result = await self.db.execute(select(Order).where(Order.id == order_id))
        order = result.scalars().first()
        
        if not order:
            return error_response("订单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        return success_response(data=self._serialize_order(order, detailed=True))
    
    async def create_order(self, data: dict) -> Dict[str, Any]:
        """创建订单"""
        # 生成订单号
        order_no = data.get("order_no") or self._generate_order_no()
        
        # 检查订单号是否重复
        existing = await self.db.execute(
            select(Order).where(Order.order_no == order_no)
        )
        if existing.scalars().first():
            return error_response("订单号已存在", ErrorCodes.RESOURCE_ALREADY_EXISTS)
        
        order = Order(
            order_no=order_no,
            plan_id=data.get("plan_id"),
            amount=data.get("amount", 0),
            channel=data.get("channel", ""),
            responsible=data.get("responsible", ""),
            status=data.get("status", "pending"),
        )
        self.db.add(order)
        
        try:
            await self.db.commit()
            await self.db.refresh(order)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"创建订单失败: {e}")
            return error_response("创建订单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"创建订单: {order.order_no} (ID: {order.id})")
        return success_response(data=self._serialize_order(order), message="创建成功")
    
    async def update_order(self, order_id: int, data: dict) -> Dict[str, Any]:
        """更新订单"""
        result = await self.db.execute(select(Order).where(Order.id == order_id))
        order = result.scalars().first()
        
        if not order:
            return error_response("订单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 更新字段
        updatable_fields = ["plan_id", "amount", "channel", "responsible", "status", "refund_amount"]
        for field in updatable_fields:
            if field in data:
                setattr(order, field, data[field])
        
        # 如果状态改为已付款，记录付款时间
        if data.get("status") == "paid" and order.status != "paid":
            order.paid_at = datetime.now()
        
        try:
            await self.db.commit()
            await self.db.refresh(order)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"更新订单失败: {e}")
            return error_response("更新订单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"更新订单: {order.order_no} (ID: {order.id})")
        return success_response(data=self._serialize_order(order), message="更新成功")
    
    async def delete_order(self, order_id: int) -> Dict[str, Any]:
        """删除订单"""
        result = await self.db.execute(select(Order).where(Order.id == order_id))
        order = result.scalars().first()
        
        if not order:
            return error_response("订单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 已付款订单不能直接删除
        if order.status == "paid":
            return error_response("已付款订单不能删除，请先退款", ErrorCodes.INVALID_PARAMS)
        
        try:
            await self.db.delete(order)
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            logger.error(f"删除订单失败: {e}")
            return error_response("删除订单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"删除订单: {order.order_no} (ID: {order.id})")
        return success_response(message="删除成功")
    
    async def get_order_stats(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """获取订单统计"""
        query = select(Order)
        
        if start_date:
            query = query.where(func.date(Order.created_at) >= start_date)
        if end_date:
            query = query.where(func.date(Order.created_at) <= end_date)
        
        # 基础统计
        stats_result = await self.db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.amount), 0),
                func.sum(func.case((Order.status == "paid", 1), else_=0)),
                func.sum(func.case((Order.status == "pending", 1), else_=0)),
                func.sum(func.case((Order.status == "refunded", 1), else_=0)),
            ).where(Order.id.in_(select(Order.id).where(
                *(
                    [func.date(Order.created_at) >= start_date] if start_date else []
                ),
                *(
                    [func.date(Order.created_at) <= end_date] if end_date else []
                )
            )))
        )
        total_orders, total_amount, paid_count, pending_count, refunded_count = stats_result.one()
        
        # 已付款金额
        paid_amount_result = await self.db.execute(
            select(func.coalesce(func.sum(Order.amount), 0)).where(
                Order.status == "paid",
                *(
                    [func.date(Order.created_at) >= start_date] if start_date else []
                ),
                *(
                    [func.date(Order.created_at) <= end_date] if end_date else []
                )
            )
        )
        paid_amount = paid_amount_result.scalar() or 0
        
        return success_response(data={
            "total_orders": total_orders or 0,
            "total_amount": float(total_amount or 0),
            "paid_orders": paid_count or 0,
            "pending_orders": pending_count or 0,
            "refunded_orders": refunded_count or 0,
            "paid_amount": float(paid_amount),
        })
    
    def _serialize_order(self, order: Order, detailed: bool = False) -> dict:
        """序列化订单对象"""
        data = {
            "id": order.id,
            "order_no": order.order_no,
            "plan_id": order.plan_id,
            "amount": float(order.amount),
            "channel": order.channel,
            "responsible": order.responsible,
            "status": order.status,
            "refund_amount": float(order.refund_amount or 0),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "paid_at": order.paid_at.isoformat() if order.paid_at else None,
        }
        
        if detailed:
            data["updated_at"] = order.updated_at.isoformat() if order.updated_at else None
        
        return data
    
    def _generate_order_no(self) -> str:
        """生成订单号"""
        now = datetime.now()
        timestamp = now.strftime("%Y%m%d%H%M%S")
        import random
        random_suffix = str(random.randint(1000, 9999))
        return f"ORD{timestamp}{random_suffix}"