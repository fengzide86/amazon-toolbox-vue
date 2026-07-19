"""
设备管理路由模块
包含设备列表、解绑等接口
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.audit import log_admin_action
from core.dependencies import get_current_admin, get_current_user
from core.exceptions import ConflictException, NotFoundException
from core.logging import get_logger
from database import get_db
from models import AuthCode, AuthSeat, Device, User

logger = get_logger(__name__)

router = APIRouter()


async def release_device_seat(db: AsyncSession, device: Device) -> None:
    """Release active seats associated with a device being unbound."""
    result = await db.execute(
        select(AuthSeat).where(
            AuthSeat.auth_code_id == device.auth_code_id,
            AuthSeat.device_id == device.device_id,
            AuthSeat.status == "active"
        )
    )
    for seat in result.scalars().all():
        seat.status = "inactive"
        seat.updated_at = datetime.utcnow()


@router.get("")
async def get_devices(
    auth_code_id: int | None = Query(None, description="授权码ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取设备列表（管理员）"""
    # 使用 selectinload 预加载关联的授权码信息，避免 N+1 查询
    query = select(Device).options(selectinload(Device.auth_code))
    count_query = select(func.count(Device.id))
    if auth_code_id:
        query = query.where(Device.auth_code_id == auth_code_id)
        count_query = count_query.where(Device.auth_code_id == auth_code_id)

    count_result = await db.execute(count_query)
    query = (
        query.order_by(Device.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    devices = result.scalars().all()
    
    # 直接从预加载的关联对象获取授权码信息
    device_list = []
    for device in devices:
        auth_code = device.auth_code
        device_list.append({
            "id": device.id,
            "auth_code_id": device.auth_code_id,
            "auth_code": auth_code.code if auth_code else "未知",
            "device_id": device.device_id,
            "device_name": device.device_name or "未知设备",
            "created_at": device.created_at.isoformat() if device.created_at else None
        })
    
    return {
        "data": device_list,
        "page": page,
        "page_size": page_size,
        "total": int(count_result.scalar() or 0),
    }


@router.get("/my")
async def get_my_devices(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """获取用户的设备列表"""
    # 使用当前登录用户的 user_id（从 Token 中获取，防止伪造）
    user_id = current_user.get("user_id")
    
    # 通过 user_id 找到 User，再通过 auth_code_id 找到设备
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalars().first()
    
    if not user or not user.auth_code_id:
        return []
    
    result = await db.execute(
        select(AuthCode)
        .options(selectinload(AuthCode.devices))
        .where(AuthCode.id == user.auth_code_id)
    )
    auth_code = result.scalars().first()
    
    if not auth_code:
        return []
    
    return [{
        "id": d.id,
        "device_id": d.device_id,
        "device_name": d.device_name or "未知设备",
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "is_current": False  # 前端自行判断
    } for d in auth_code.devices]


@router.post("/unbind")
async def unbind_device(
    request: Request,
    device_id: int = Query(..., description="设备记录ID"),
    reason: str = Query(..., min_length=2, max_length=500, description="解绑原因"),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """解绑设备（管理员）"""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalars().first()
    
    if not device:
        raise NotFoundException("设备不存在")
    
    device_name = device.device_name or "未知设备"
    await release_device_seat(db, device)
    await db.delete(device)
    await log_admin_action(
        db,
        user_id=_admin.get("staff_id"),
        user_name=_admin.get("username"),
        action="device_unbind",
        target_type="device",
        target_id=device_id,
        detail={
            "role": _admin.get("role"),
            "before": {
                "device_name": device_name,
                "device_id": device.device_id,
                "auth_code_id": device.auth_code_id,
            },
            "after": {"unbound": True},
            "reason": reason,
        },
        request=request,
    )
    await db.commit()
    
    logger.info(f"解绑设备: {device_name} (ID: {device_id})")
    return {"success": True, "message": f"设备 {device_name} 已解绑"}


@router.post("/user-unbind")
async def user_unbind_device(
    device_id: int = Query(..., description="设备记录ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """用户解绑自己的设备"""
    # 使用当前登录用户的 user_id（从 Token 中获取，防止伪造）
    user_id = current_user.get("user_id")
    
    # 验证设备属于该用户
    result = await db.execute(
        select(AuthCode).where(AuthCode.user_id == user_id)
    )
    auth_code = result.scalars().first()
    
    if not auth_code:
        raise NotFoundException("未找到授权信息")
    
    # 检查设备是否属于该授权码
    device_result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            Device.auth_code_id == auth_code.id
        )
    )
    device = device_result.scalars().first()
    
    if not device:
        raise NotFoundException("设备不存在或不属于您")
    
    # 检查是否只剩一个设备
    count_result = await db.execute(
        select(func.count(Device.id)).where(Device.auth_code_id == auth_code.id)
    )
    device_count = count_result.scalar()
    
    if device_count <= 1:
        raise ConflictException("至少需要保留一个设备")
    
    device_name = device.device_name or "未知设备"
    await release_device_seat(db, device)
    await db.delete(device)
    await db.commit()
    
    logger.info(f"用户解绑设备: {device_name} (ID: {device_id})")
    return {"success": True, "message": f"设备 {device_name} 已解绑"}
