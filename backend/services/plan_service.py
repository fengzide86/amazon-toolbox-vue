"""
套餐服务模块
包含套餐 CRUD、缓存管理、排序等业务逻辑
"""
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models import Plan, AuthCode, Order
from core.logging import get_logger
from core.response import success_response, error_response, ErrorCodes
from core.cache import cache, CacheKeys
from core.pagination import PaginationParams, paginate

logger = get_logger(__name__)


class PlanService:
    """套餐服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_plans_list(
        self,
        status: Optional[str] = None,
        pagination: Optional[PaginationParams] = None
    ) -> Dict[str, Any]:
        """获取套餐列表（带缓存）
        
        Args:
            status: 状态过滤（active/disabled/deleted）
            pagination: 分页参数，None 则返回全部
        """
        # 尝试从缓存获取（仅无过滤条件时）
        cache_key = CacheKeys.PLANS_LIST
        if not status and not pagination:
            cached = await cache.get(cache_key)
            if cached:
                return cached
        
        # 构建查询
        query = select(Plan).order_by(Plan.sort_order, Plan.id)
        if status:
            query = query.where(Plan.status == status)
        else:
            # 默认排除已删除
            query = query.where(Plan.status != "deleted")
        
        if pagination:
            items, total = await paginate(query, self.db, pagination)
            result = success_response(
                data=[self._serialize_plan(p) for p in items],
                total=total,
                page=pagination.page,
                page_size=pagination.page_size,
            )
        else:
            result_query = await self.db.execute(query)
            plans = result_query.scalars().all()
            result = success_response(
                data=[self._serialize_plan(p) for p in plans]
            )
        
        # 缓存结果
        if not status and not pagination:
            await cache.set(cache_key, result, ttl=300)
        
        return result
    
    async def get_plan_by_id(self, plan_id: int) -> Dict[str, Any]:
        """根据 ID 获取套餐详情"""
        # 尝试缓存
        cache_key = CacheKeys.plan_detail(plan_id)
        cached = await cache.get(cache_key)
        if cached:
            return cached
        
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalars().first()
        
        if not plan:
            return error_response("套餐不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        data = self._serialize_plan(plan, detailed=True)
        result = success_response(data=data)
        
        # 缓存5分钟
        await cache.set(cache_key, result, ttl=300)
        
        return result
    
    async def create_plan(self, data: dict) -> Dict[str, Any]:
        """创建套餐"""
        # 检查名称是否重复
        existing = await self.db.execute(
            select(Plan).where(Plan.name == data["name"])
        )
        if existing.scalars().first():
            return error_response("套餐名称已存在", ErrorCodes.RESOURCE_ALREADY_EXISTS)
        
        plan = Plan(
            name=data["name"],
            price=data["price"],
            duration_days=data["duration_days"],
            features=data.get("features", ""),
            status=data.get("status", "active"),
            code_prefix=data.get("code_prefix", ""),
            sort_order=data.get("sort_order", 0),
        )
        self.db.add(plan)
        
        try:
            await self.db.commit()
            await self.db.refresh(plan)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"创建套餐失败: {e}")
            return error_response("创建套餐失败", ErrorCodes.DATABASE_ERROR)
        
        # 清除缓存
        await self._invalidate_cache()
        
        logger.info(f"创建套餐: {plan.name} (ID: {plan.id})")
        return success_response(data=self._serialize_plan(plan), message="创建成功")
    
    async def update_plan(self, plan_id: int, data: dict) -> Dict[str, Any]:
        """更新套餐"""
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalars().first()
        
        if not plan:
            return error_response("套餐不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 检查名称重复（排除自身）
        if "name" in data and data["name"] != plan.name:
            existing = await self.db.execute(
                select(Plan).where(Plan.name == data["name"], Plan.id != plan_id)
            )
            if existing.scalars().first():
                return error_response("套餐名称已存在", ErrorCodes.RESOURCE_ALREADY_EXISTS)
        
        # 更新字段
        for field in ["name", "price", "duration_days", "features", "status", "code_prefix", "sort_order"]:
            if field in data:
                setattr(plan, field, data[field])
        
        try:
            await self.db.commit()
            await self.db.refresh(plan)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"更新套餐失败: {e}")
            return error_response("更新套餐失败", ErrorCodes.DATABASE_ERROR)
        
        # 清除缓存
        await self._invalidate_cache()
        await cache.delete(CacheKeys.plan_detail(plan_id))
        
        logger.info(f"更新套餐: {plan.name} (ID: {plan.id})")
        return success_response(data=self._serialize_plan(plan), message="更新成功")
    
    async def delete_plan(self, plan_id: int) -> Dict[str, Any]:
        """删除套餐（软删除）"""
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalars().first()
        
        if not plan:
            return error_response("套餐不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 检查是否有关联的活跃授权码
        active_count_result = await self.db.execute(
            select(func.count(AuthCode.id)).where(
                AuthCode.plan_id == plan_id,
                AuthCode.status.in_(["active", "unused"])
            )
        )
        active_count = active_count_result.scalar() or 0
        
        if active_count > 0:
            return error_response(
                f"该套餐下有 {active_count} 个活跃授权码，无法删除",
                ErrorCodes.RESOURCE_ALREADY_EXISTS
            )
        
        # 软删除
        plan.status = "deleted"
        
        try:
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            logger.error(f"删除套餐失败: {e}")
            return error_response("删除套餐失败", ErrorCodes.DATABASE_ERROR)
        
        # 清除缓存
        await self._invalidate_cache()
        await cache.delete(CacheKeys.plan_detail(plan_id))
        
        logger.info(f"删除套餐: {plan.name} (ID: {plan.id})")
        return success_response(message="删除成功")
    
    async def get_plan_stats(self, plan_id: int) -> Dict[str, Any]:
        """获取套餐统计信息"""
        result = await self.db.execute(select(Plan).where(Plan.id == plan_id))
        plan = result.scalars().first()
        
        if not plan:
            return error_response("套餐不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 授权码统计
        codes_result = await self.db.execute(
            select(
                func.count(AuthCode.id),
                func.sum(func.case((AuthCode.status == "active", 1), else_=0)),
                func.sum(func.case((AuthCode.status == "unused", 1), else_=0)),
                func.sum(func.case((AuthCode.status == "expired", 1), else_=0)),
            ).where(AuthCode.plan_id == plan_id)
        )
        total_codes, active_codes, unused_codes, expired_codes = codes_result.one()
        
        # 订单统计
        orders_result = await self.db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.amount), 0),
            ).where(Order.plan_id == plan_id, Order.status == "paid")
        )
        total_orders, total_revenue = orders_result.one()
        
        return success_response(data={
            "plan": self._serialize_plan(plan),
            "codes": {
                "total": total_codes or 0,
                "active": active_codes or 0,
                "unused": unused_codes or 0,
                "expired": expired_codes or 0,
            },
            "orders": {
                "total": total_orders or 0,
                "revenue": float(total_revenue or 0),
            }
        })
    
    def _serialize_plan(self, plan: Plan, detailed: bool = False) -> dict:
        """序列化套餐对象"""
        data = {
            "id": plan.id,
            "name": plan.name,
            "price": float(plan.price),
            "duration_days": plan.duration_days,
            "status": plan.status,
            "code_prefix": plan.code_prefix,
            "sort_order": plan.sort_order,
            "created_at": plan.created_at.isoformat() if plan.created_at else None,
        }
        
        if detailed:
            data["features"] = plan.features
            data["updated_at"] = plan.updated_at.isoformat() if plan.updated_at else None
        
        return data
    
    async def _invalidate_cache(self):
        """清除套餐相关缓存"""
        await cache.delete(CacheKeys.PLANS_LIST)
        await cache.delete_pattern("plan:*")