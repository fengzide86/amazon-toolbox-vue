"""
分润管理路由模块
包含分润记录的查询、汇总等接口
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from models import ProfitRecord, Order
from schemas import ProfitRecordResponse
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("", response_model=List[ProfitRecordResponse])
async def get_profit_records(page: int = 1, page_size: int = 50, platform_key: str = None, db: AsyncSession = Depends(get_db)):
    """获取分润记录列表（支持分页和平台过滤）"""
    offset = (page - 1) * page_size
    query = select(ProfitRecord).join(Order, ProfitRecord.order_id == Order.id)
    if platform_key:
        from sqlalchemy import or_
        query = query.where(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
    result = await db.execute(
        query.order_by(ProfitRecord.created_at.desc()).offset(offset).limit(page_size)
    )
    return result.scalars().all()


@router.get("/summary")
async def get_profit_summary(platform_key: str = None, db: AsyncSession = Depends(get_db)):
    """获取分润汇总数据（支持平台过滤）
    
    使用 SQL 聚合函数计算，避免全表加载到内存
    """
    query = select(
        func.coalesce(func.sum(ProfitRecord.tech_share), 0),
        func.coalesce(func.sum(ProfitRecord.market_share), 0),
        func.coalesce(func.sum(ProfitRecord.product_share), 0),
        func.coalesce(func.sum(ProfitRecord.service_share), 0),
        func.coalesce(func.sum(ProfitRecord.coordination_share), 0),
        func.coalesce(func.sum(ProfitRecord.record_share), 0),
    ).join(Order, ProfitRecord.order_id == Order.id)
    
    if platform_key:
        from sqlalchemy import or_
        query = query.where(or_(Order.platform_key == platform_key, Order.platform_key.is_(None)))
    
    result = await db.execute(query)
    row = result.one()
    total_tech, total_market, total_product, total_service, total_coordination, total_record = row
    
    return {
        "total_tech": float(total_tech),
        "total_market": float(total_market),
        "total_product": float(total_product),
        "total_service": float(total_service),
        "total_coordination": float(total_coordination),
        "total_record": float(total_record),
        "grand_total": float(total_tech + total_market + total_product + total_service + total_coordination + total_record),
    }
