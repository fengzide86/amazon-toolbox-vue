"""
认证路由模块（优化版）
使用服务层 + 统一响应格式
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from database import get_db
from models import AuthCode
from schemas import VerifyRequest, AdminLoginRequest
from core.dependencies import get_current_user
from core.security import verify_token, create_access_token
from core.token_blacklist import is_token_blacklisted
from services.auth_service import AuthService

router = APIRouter()


# ===== 登录接口限流（防暴力破解）=====
from slowapi.util import get_remote_address
from slowapi import Limiter

auth_limiter = Limiter(key_func=get_remote_address)


@router.post("/verify")
@auth_limiter.limit("10/minute")  # 每分钟最多10次尝试
async def verify_auth_code(request: Request, req: VerifyRequest, db: AsyncSession = Depends(get_db)):
    """授权码验证（用户登录）"""
    service = AuthService(db)
    return await service.verify_auth_code(req.code, req.device_id, req.device_name)


@router.post("/admin-login")
@auth_limiter.limit("5/minute")  # 管理员登录更严格：每分钟5次
async def admin_login(request: Request, req: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    """管理员登录"""
    service = AuthService(db)
    return await service.admin_login(req.password)


@router.post("/check")
async def check_auth_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """检查授权码状态（用于踢人检测）"""
    service = AuthService(db)
    return await service.check_auth_status(current_user.get("auth_code_id"))


@router.get("/me")
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前用户信息"""
    service = AuthService(db)
    return await service.get_user_info(
        current_user.get("user_id"),
        current_user.get("auth_code_id"),
        current_user.get("role")
    )


# 可选的 JWT 认证（用于 refresh，需要获取原始 Token）
optional_security = HTTPBearer(auto_error=True)


@router.post("/refresh")
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(optional_security),
    db: AsyncSession = Depends(get_db)
):
    """刷新 Token
    
    安全检查:
    1. 验证当前 Token 是否在黑名单中
    2. 验证用户授权码是否仍然有效
    """
    token = credentials.credentials
    
    # 1. 检查 Token 是否在黑名单中
    if await is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已失效，请重新登录"
        )
    
    # 2. 验证 Token 有效性
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效"
        )
    
    user_id = payload.get("user_id")
    role = payload.get("role", "user")
    auth_code_id = payload.get("auth_code_id")
    
    # 3. 管理员特殊处理
    if role == "admin" and user_id == 0:
        new_token = create_access_token(data={
            "user_id": 0,
            "role": "admin",
            "auth_code_id": None,
        })
        return {"success": True, "data": {"token": new_token}}
    
    # 4. 检查授权码是否仍然有效（防止授权码被冻结/删除后仍可刷新）
    if auth_code_id:
        result = await db.execute(
            select(AuthCode).where(AuthCode.id == auth_code_id)
        )
        auth_code = result.scalars().first()
        
        if not auth_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="授权码不存在"
            )
        
        if auth_code.status == "frozen":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="授权码已被冻结"
            )
        
        if auth_code.status == "deleted":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="授权码已被删除"
            )
        
        if auth_code.status == "expired" or (auth_code.expires_at and auth_code.expires_at < datetime.now()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="授权码已过期"
            )
    
    # 5. 签发新 Token
    new_token = create_access_token(data={
        "user_id": user_id,
        "role": role,
        "auth_code_id": auth_code_id,
    })
    return {"success": True, "data": {"token": new_token}}
