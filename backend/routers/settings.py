"""
系统设置路由模块
包含系统配置的查询、更新等接口
拆分为公开接口和管理员接口
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from models import Setting
from schemas import SettingUpdate, SettingResponse
from core.logging import get_logger
from core.security import hash_password
from core.dependencies import get_current_admin

logger = get_logger(__name__)

router = APIRouter()


# ===== 公开接口 =====

@router.get("/public")
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

@router.get("", response_model=List[SettingResponse])
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """获取所有系统设置 - 仅管理员
    
    注意：不返回管理员密码的哈希值
    """
    result = await db.execute(select(Setting).order_by(Setting.key))
    settings = result.scalars().all()
    
    safe_settings = []
    for s in settings:
        if s.key == "admin_password":
            safe_settings.append(SettingResponse(
                id=s.id, key=s.key, value="********", 
                description=s.description, created_at=s.created_at
            ))
        else:
            safe_settings.append(s)
    return safe_settings


@router.put("")
async def update_setting(
    req: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
    """更新系统设置 - 仅管理员
    
    管理员密码修改时使用 bcrypt 哈希
    """
    result = await db.execute(select(Setting).where(Setting.key == req.key))
    setting = result.scalars().first()
    
    value_to_store = req.value
    # 管理员密码修改时使用 bcrypt 哈希
    if req.key == "admin_password":
        value_to_store = hash_password(req.value)
        logger.info("管理员密码已更新")
    
    if setting:
        setting.value = value_to_store
        if req.description:
            setting.description = req.description
    else:
        setting = Setting(key=req.key, value=value_to_store, description=req.description)
        db.add(setting)
    
    await db.commit()
    logger.info(f"更新设置: {req.key}")
    return {"success": True}