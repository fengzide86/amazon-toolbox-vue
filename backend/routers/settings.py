"""
系统设置路由模块
包含系统配置的查询、更新等接口
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


@router.get("", response_model=List[SettingResponse])
async def get_settings(db: AsyncSession = Depends(get_db)):
    """获取所有系统设置
    
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
    """更新系统设置
    
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