"""
依赖注入模块
提供数据库会话、当前用户等依赖
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, AuthCode
from core.security import verify_token, extract_token_from_header


# ===== 数据库会话依赖 =====

async def get_current_db() -> AsyncSession:
    """获取当前数据库会话（用于依赖注入）"""
    async for session in get_db():
        yield session


# ===== JWT 认证依赖 =====

# 可选的 JWT 认证（允许未登录访问）
optional_security = HTTPBearer(auto_error=False)

async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: AsyncSession = Depends(get_current_db)
) -> Optional[dict]:
    """获取当前用户（可选，允许未登录）
    
    Returns:
        用户信息字典 {"user_id": int, "role": str, "auth_code_id": int} 或 None
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        return None
    
    user_id = payload.get("user_id")
    if not user_id:
        return None
    
    # 查询用户是否存在
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    return {
        "user_id": user.id,
        "role": "admin" if user.auth_code_id is None else "user",
        "auth_code_id": user.auth_code_id,
    }


# 必需的 JWT 认证（必须登录）
required_security = HTTPBearer(auto_error=True)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(required_security),
    db: AsyncSession = Depends(get_current_db)
) -> dict:
    """获取当前用户（必须登录）
    
    Raises:
        HTTPException: 如果未登录或 Token 无效
    """
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("user_id")
    role = payload.get("role", "user")
    auth_code_id = payload.get("auth_code_id")
    
    # 管理员特殊处理：基于 role 判断，不再依赖 user_id==0
    if role == "admin":
        return {
            "user_id": user_id,
            "role": "admin",
            "auth_code_id": None,
        }
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 数据无效",
        )
    
    # 查询用户是否存在
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    
    return {
        "user_id": user.id,
        "role": "admin" if user.auth_code_id is None else "user",
        "auth_code_id": user.auth_code_id,
    }


# ===== 管理员权限依赖 =====

async def get_current_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """获取当前管理员（必须是管理员角色）
    
    Raises:
        HTTPException: 如果不是管理员
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    
    return current_user


# ===== 授权码验证依赖 =====

async def verify_auth_code_active(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_current_db)
) -> dict:
    """验证用户的授权码是否有效
    
    Raises:
        HTTPException: 如果授权码无效或已过期
    """
    auth_code_id = current_user.get("auth_code_id")
    
    if not auth_code_id:
        # 管理员没有授权码
        return current_user
    
    # 查询授权码
    result = await db.execute(
        select(AuthCode).where(AuthCode.id == auth_code_id)
    )
    auth_code = result.scalar_one_or_none()
    
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="授权码不存在",
        )
    
    if auth_code.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"授权码状态异常: {auth_code.status}",
        )
    
    return current_user