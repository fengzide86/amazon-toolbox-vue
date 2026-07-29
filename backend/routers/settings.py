"""
系统设置路由模块
包含系统配置的查询、更新等接口
拆分为公开接口和管理员接口
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.dependencies import require_super_admin
from core.logging import get_logger
from core.response import CompatibleResponse
from database import get_db
from models import Setting
from schemas import SettingResponse, SettingUpdate

logger = get_logger(__name__)

router = APIRouter()


# ===== 公开接口 =====

@router.get("/public", response_model=CompatibleResponse)
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """获取公开系统设置（无需登录）
    
    只返回公开配置，不返回敏感信息
    """
    # 公开允许的 key 列表
    public_keys = [
        "system_name",
        "logo_url",
        "service_wechat",
        "wechat_id",
        "terms_of_service",
        "default_announcement",
        "enable_ai_chat",
        "enable_auto_update",
    ]
    
    result = await db.execute(
        select(Setting)
        .where(Setting.key.in_(public_keys))
        .order_by(Setting.key)
    )
    settings = result.scalars().all()
    
    return [
        SettingResponse(
            id=s.id,
            key=s.key,
            value=s.value,
            description=s.description,
            created_at=s.created_at
        )
        for s in settings
    ]


# ===== 管理员接口 =====

@router.get("", response_model=list[SettingResponse])
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(require_super_admin)
):
    """获取所有系统设置 - 仅管理员
    
    后台密码不再存储在 settings 中。
    """
    result = await db.execute(
        select(Setting).where(Setting.key != "admin_password").order_by(Setting.key)
    )
    settings = result.scalars().all()
    
    return settings


@router.put("", response_model=CompatibleResponse)
async def update_setting(
    req: SettingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin)
):
    """更新系统设置 - 仅管理员
    
    后台账号密码必须通过 /api/staff 账号接口修改。
    """
    if req.key == "admin_password":
        raise HTTPException(status_code=422, detail="请使用后台账号密码接口")
    result = await db.execute(
        select(Setting).where(Setting.key == req.key).with_for_update()
    )
    setting = result.scalars().first()
    before = (
        {
            "key": setting.key,
            "value": setting.value,
            "description": setting.description,
        }
        if setting
        else None
    )
    
    if setting:
        setting.value = req.value
        if req.description:
            setting.description = req.description
    else:
        setting = Setting(key=req.key, value=req.value, description=req.description)
        db.add(setting)

    await db.flush()
    await log_admin_action(
        db,
        user_id=actor["staff_id"],
        user_name=actor["username"],
        action="setting_update",
        target_type="setting",
        target_id=req.key,
        detail={
            "role": actor["role"],
            "before": before,
            "after": {
                "key": setting.key,
                "value": setting.value,
                "description": setting.description,
            },
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    logger.info(f"更新设置: {req.key}")
    return {"success": True}
