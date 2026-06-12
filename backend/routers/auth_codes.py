"""
授权码管理路由模块
包含授权码的生成、查询、更新、删除等接口
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timedelta
import random
import string

from database import get_db
from models import AuthCode, Plan, Device
from schemas import AuthCodeGenerate, AuthCodeUpdate, AuthCodeResponse
from core.logging import get_logger
from core.exceptions import NotFoundException, ConflictException
from core.dependencies import get_current_admin

logger = get_logger(__name__)

router = APIRouter()


def generate_random_code(length: int = 6) -> str:
    """生成随机大写字母和数字组合"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


@router.get("", response_model=List[AuthCodeResponse])
async def get_auth_codes(page: int = 1, page_size: int = 100, db: AsyncSession = Depends(get_db)):
    """获取授权码列表（支持分页）"""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(AuthCode)
        .options(selectinload(AuthCode.devices))
        .order_by(AuthCode.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return result.scalars().all()


@router.post("/batch-generate")
async def batch_generate_codes(req: AuthCodeGenerate, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """批量生成授权码
    
    格式: 前缀-日期MMDD-随机6位
    例如: SVIP-0606-ABC123
    
    前缀优先级:
    1. 套餐的 code_prefix 字段（如 "SVIP"）
    2. 套餐名的第一个单词
    3. "UNKNOWN"
    """
    codes = []
    
    # 获取套餐信息
    plan_name = "UNKNOWN"
    code_prefix = None
    expires_at = None
    if req.plan_id:
        plan_result = await db.execute(select(Plan).where(Plan.id == req.plan_id))
        plan = plan_result.scalars().first()
        if plan:
            # 优先使用套餐的 code_prefix 字段
            code_prefix = plan.code_prefix
            # 如果没有 code_prefix，使用套餐名的第一个单词
            plan_name = plan.name.split()[0] if plan.name else "UNKNOWN"
            if req.duration_days:
                expires_at = datetime.now() + timedelta(days=req.duration_days)
            else:
                expires_at = datetime.now() + timedelta(days=plan.duration_days)
    elif req.duration_days:
        expires_at = datetime.now() + timedelta(days=req.duration_days)
    
    # 日期格式 MMDD
    date_str = datetime.now().strftime("%m%d")
    
    for _ in range(req.count):
        # 生成随机部分
        random_part = generate_random_code(6)
        
        # 确定前缀: 优先使用 code_prefix，否则使用 plan_name
        prefix = code_prefix if code_prefix else plan_name
        code_str = f"{prefix}-{date_str}-{random_part}"
        
        code_obj = AuthCode(
            code=code_str, 
            plan_id=req.plan_id, 
            status="unused", 
            expires_at=expires_at,
            max_devices=req.max_devices if req.max_devices else 1
        )
        db.add(code_obj)
        codes.append(code_str)

    await db.commit()
    logger.info(f"批量生成 {req.count} 个授权码，前缀: {code_prefix or plan_name}")
    return {"success": True, "codes": codes, "count": req.count}


@router.put("/{code_id}", response_model=AuthCodeResponse)
async def update_auth_code(code_id: int, req: AuthCodeUpdate, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新授权码信息"""
    result = await db.execute(
        select(AuthCode).options(selectinload(AuthCode.devices)).where(AuthCode.id == code_id)
    )
    code_obj = result.scalars().first()
    if not code_obj:
        raise NotFoundException("授权码不存在")
    
    for k, v in req.model_dump(exclude_none=True).items():
        if k == "expires_at" and isinstance(v, str):
            v = datetime.fromisoformat(v)
        setattr(code_obj, k, v)
    await db.commit()
    await db.refresh(code_obj)
    logger.info(f"更新授权码: {code_obj.code}")
    return code_obj


@router.delete("/{code_id}")
async def delete_auth_code(code_id: int, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """删除授权码"""
    result = await db.execute(select(AuthCode).where(AuthCode.id == code_id))
    code_obj = result.scalars().first()
    if not code_obj:
        raise NotFoundException("授权码不存在")
    
    try:
        # 先删除关联的设备记录，避免外键约束失败
        await db.execute(delete(Device).where(Device.auth_code_id == code_id))
        await db.delete(code_obj)
        await db.commit()
        logger.info(f"删除授权码: {code_obj.code}")
        return {"success": True}
    except IntegrityError:
        await db.rollback()
        raise ConflictException("该授权码存在关联数据，无法删除")
