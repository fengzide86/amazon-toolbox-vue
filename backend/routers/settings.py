"""
系统设置路由模块
包含系统配置的查询、更新等接口
拆分为公开接口和管理员接口
"""
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import require_super_admin
from core.logging import get_logger
from database import get_db
from domains.platform import settings as settings_service
from schemas import SettingResponse, SettingUpdate
from schemas.system import SettingUpdateResponse

logger = get_logger(__name__)

router = APIRouter()


# ===== 公开接口 =====

@router.get("/public", response_model=list[SettingResponse])
async def get_public_settings(db: AsyncSession = Depends(get_db)) -> list[SettingResponse]:
    """获取公开系统设置（无需登录）
    
    只返回公开配置，不返回敏感信息
    """
    return await settings_service.list_public(db)


# ===== 管理员接口 =====

@router.get("", response_model=list[SettingResponse])
async def get_all_settings(
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(require_super_admin),
) -> list[SettingResponse]:
    """获取所有系统设置 - 仅管理员
    
    后台密码不再存储在 settings 中。
    """
    return await settings_service.list_admin(db)


@router.put("", response_model=SettingUpdateResponse)
async def update_setting(
    req: SettingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, Any] = Depends(require_super_admin),
) -> dict[str, bool]:
    """更新系统设置 - 仅管理员
    
    后台账号密码必须通过 /api/staff 账号接口修改。
    """
    await settings_service.update(db, req, actor=actor, request=request)
    logger.info(f"更新设置: {req.key}")
    return {"success": True}
