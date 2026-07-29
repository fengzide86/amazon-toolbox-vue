"""
授权码管理路由模块
包含授权码的生成、查询、更新、删除等接口
"""
import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.audit import log_admin_action
from core.dependencies import get_current_admin
from core.exceptions import NotFoundException
from core.logging import get_logger
from core.response import CompatibleResponse
from database import get_db
from domains.access import normalize_entitlements
from models import AuthCode, AuthSeat, Device, Plan
from schemas import AuthCodeGenerate, AuthCodeResponse, AuthCodeUpdate

logger = get_logger(__name__)

router = APIRouter()


def _parse_platform_scope(scope_str: str) -> list[str]:
    """将 platform_scope 字符串转为数组，空值兼容为 ['amazon']"""
    if not scope_str:
        return ["amazon"]
    return [p.strip() for p in scope_str.split(",") if p.strip()]


async def _calculate_seat_used(db: AsyncSession, auth_code_id: int) -> int:
    """统计 active 席位数"""
    result = await db.execute(
        select(func.count(AuthSeat.id)).where(
            AuthSeat.auth_code_id == auth_code_id,
            AuthSeat.status == "active"
        )
    )
    return result.scalar() or 0


async def _calculate_device_used(db: AsyncSession, auth_code_id: int) -> int:
    """统计设备数"""
    result = await db.execute(
        select(func.count(Device.id)).where(Device.auth_code_id == auth_code_id)
    )
    return result.scalar() or 0


async def _build_auth_code_response(db: AsyncSession, code: AuthCode) -> AuthCodeResponse:
    """Build the public admin shape from the persisted string-backed model."""
    seat_used = await _calculate_seat_used(db, code.id)
    device_used = await _calculate_device_used(db, code.id)
    plan_result = await db.execute(
        select(Plan.name, Plan.product_type, Plan.entitlements).where(Plan.id == code.plan_id)
    )
    plan_row = plan_result.first()
    plan_name = plan_row[0] if plan_row else "未关联套餐"
    product_type = (plan_row[1] if plan_row else None) or "consumer"
    plan_entitlements = plan_row[2] if plan_row else None
    return AuthCodeResponse(**{
        "id": code.id,
        "code": code.code,
        "plan_id": code.plan_id,
        "user_id": code.user_id,
        "device_id": code.device_id,
        "device_name": code.device_name,
        "max_devices": code.max_devices,
        "status": code.status,
        "expires_at": code.expires_at,
        "created_at": code.created_at,
        "devices": code.devices,
        "platform_scope": _parse_platform_scope(code.platform_scope),
        "scene_type": code.scene_type,
        "seat_limit": code.seat_limit,
        "seat_used": seat_used,
        "device_used": device_used,
        "plan_name": plan_name,
        "product_type": product_type,
        "entitlements": normalize_entitlements(plan_entitlements, product_type),
    })


def generate_random_code(length: int = 6) -> str:
    """生成随机大写字母和数字组合"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


@router.get("", response_model=CompatibleResponse)
async def get_auth_codes(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    platform_key: str = None,
    include_deleted: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取授权码列表（支持分页和平台过滤）- 仅管理员
    
    优化: 使用子查询一次性获取统计数据，避免 N+1 查询问题
    """
    offset = (page - 1) * page_size
    
    # 构建子查询：统计每个授权码的 active 席位数
    seat_subquery = select(
        AuthSeat.auth_code_id,
        func.count(AuthSeat.id).label('seat_used')
    ).where(AuthSeat.status == "active").group_by(AuthSeat.auth_code_id).subquery()
    
    # 构建子查询：统计每个授权码的设备数
    device_subquery = select(
        Device.auth_code_id,
        func.count(Device.id).label('device_used')
    ).group_by(Device.auth_code_id).subquery()
    
    # 主查询：关联子查询获取统计数据
    query = select(
        AuthCode,
        func.coalesce(seat_subquery.c.seat_used, 0).label('seat_used'),
        func.coalesce(device_subquery.c.device_used, 0).label('device_used'),
        Plan.name.label('plan_name'),
        Plan.product_type.label('product_type'),
        Plan.entitlements.label('plan_entitlements'),
    ).options(selectinload(AuthCode.devices))
    
    # 关联子查询和 Plan 表
    query = query.outerjoin(seat_subquery, AuthCode.id == seat_subquery.c.auth_code_id)
    query = query.outerjoin(device_subquery, AuthCode.id == device_subquery.c.auth_code_id)
    query = query.outerjoin(Plan, AuthCode.plan_id == Plan.id)
    
    count_query = select(func.count(AuthCode.id))
    if not include_deleted:
        query = query.where(AuthCode.status != "deleted")
        count_query = count_query.where(AuthCode.status != "deleted")
    if platform_key:
        query = query.where(AuthCode.platform_scope.contains(platform_key))
        count_query = count_query.where(AuthCode.platform_scope.contains(platform_key))

    count_result = await db.execute(count_query)
    query = query.order_by(AuthCode.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()
    
    # 构建响应列表
    response_list = []
    for code, seat_used, device_used, plan_name, product_type, plan_entitlements in rows:
        code_dict = {
            "id": code.id,
            "code": code.code,
            "plan_id": code.plan_id,
            "user_id": code.user_id,
            "device_id": code.device_id,
            "device_name": code.device_name,
            "max_devices": code.max_devices,
            "status": code.status,
            "expires_at": code.expires_at,
            "created_at": code.created_at,
            "devices": code.devices,
            # 1.5 新增字段
            "platform_scope": _parse_platform_scope(code.platform_scope),
            "scene_type": code.scene_type,
            "seat_limit": code.seat_limit,
            "seat_used": seat_used or 0,
            "device_used": device_used or 0,
            "plan_name": plan_name or "未关联套餐",
            "product_type": product_type or "consumer",
            "entitlements": normalize_entitlements(plan_entitlements, product_type or "consumer"),
        }
        response_list.append(AuthCodeResponse(**code_dict))
    
    return {
        "data": response_list,
        "page": page,
        "page_size": page_size,
        "total": int(count_result.scalar() or 0),
    }


@router.get("/{code_id}", response_model=AuthCodeResponse)
async def get_auth_code_detail(
    code_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取授权码详情 - 仅管理员"""
    result = await db.execute(
        select(AuthCode)
        .options(selectinload(AuthCode.devices))
        .where(AuthCode.id == code_id)
    )
    code = result.scalars().first()
    
    if not code:
        raise NotFoundException("授权码不存在")
    
    return await _build_auth_code_response(db, code)


@router.post("/batch-generate", response_model=CompatibleResponse)
async def batch_generate_codes(req: AuthCodeGenerate, request: Request, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
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
            max_devices=req.max_devices if req.max_devices else 1,
            platform_scope=req.platform_scope or "amazon",
            scene_type=req.scene_type or "competition",
            seat_limit=req.seat_limit if req.seat_limit else (req.max_devices if req.max_devices else 1)
        )
        db.add(code_obj)
        codes.append(code_str)

    await db.flush()
    await log_admin_action(
        db,
        user_id=_admin.get("staff_id"),
        user_name=_admin.get("username"),
        action="batch_create_auth_codes",
        target_type="auth_code",
        detail={
            "role": _admin.get("role"),
            "before": None,
            "after": {
                "count": req.count,
                "prefix": code_prefix or plan_name,
                "codes": codes[:5],
            },
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    logger.info(f"批量生成 {req.count} 个授权码，前缀: {code_prefix or plan_name}")
    
    return {"success": True, "codes": codes, "count": req.count}


@router.put("/{code_id}", response_model=AuthCodeResponse)
async def update_auth_code(code_id: int, req: AuthCodeUpdate, request: Request, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新授权码信息"""
    result = await db.execute(
        select(AuthCode).options(selectinload(AuthCode.devices)).where(AuthCode.id == code_id)
    )
    code_obj = result.scalars().first()
    if not code_obj:
        raise NotFoundException("授权码不存在")

    before = {
        "code": code_obj.code,
        "plan_id": code_obj.plan_id,
        "status": code_obj.status,
        "expires_at": code_obj.expires_at,
        "max_devices": code_obj.max_devices,
        "platform_scope": code_obj.platform_scope,
        "scene_type": code_obj.scene_type,
        "seat_limit": code_obj.seat_limit,
    }
    for k, v in req.model_dump(exclude_none=True).items():
        if k == "expires_at" and isinstance(v, str):
            v = datetime.fromisoformat(v)
        setattr(code_obj, k, v)
    await log_admin_action(
        db,
        user_id=_admin.get("staff_id"),
        user_name=_admin.get("username"),
        action="update_auth_code",
        target_type="auth_code",
        target_id=code_id,
        detail={
            "role": _admin.get("role"),
            "before": before,
            "after": {
                **before,
                **req.model_dump(exclude_none=True),
            },
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    logger.info(f"更新授权码: {code_obj.code}")
    
    return await _build_auth_code_response(db, code_obj)


@router.delete("/{code_id}", response_model=CompatibleResponse)
async def delete_auth_code(code_id: int, request: Request, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """软删除授权码并撤销席位，保留关联业务与审计记录。"""
    result = await db.execute(select(AuthCode).where(AuthCode.id == code_id))
    code_obj = result.scalars().first()
    if not code_obj:
        raise NotFoundException("授权码不存在")

    if code_obj.status == "deleted":
        return {"success": True}

    previous_status = code_obj.status
    code_obj.status = "deleted"
    await db.execute(
        update(AuthSeat)
        .where(AuthSeat.auth_code_id == code_id, AuthSeat.status == "active")
        .values(status="inactive")
    )
    await log_admin_action(
        db,
        user_id=_admin.get("staff_id"),
        user_name=_admin.get("username"),
        action="delete_auth_code",
        target_type="auth_code",
        target_id=code_id,
        detail={
            "role": _admin.get("role"),
            "before": {"code": code_obj.code, "status": previous_status},
            "after": {"deleted": True, "status": "deleted"},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    logger.info(f"删除授权码: {code_obj.code}")
    return {"success": True}
