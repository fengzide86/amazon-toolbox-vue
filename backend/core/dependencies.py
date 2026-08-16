"""Authentication and fixed-role authorization dependencies."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.logging import set_user_id
from core.security import verify_token
from database import get_db
from models import AuthCode, StaffRole, StaffStatus, StaffUser, User
from services.staff_service import staff_to_dict

security = HTTPBearer(auto_error=False)


def _unauthorized(message: str = "登录已过期，请重新登录") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _resolve_staff_payload(
    db: AsyncSession,
    payload: dict,
) -> dict | None:
    if payload.get("token_type") != "staff":
        return None
    staff_id = payload.get("staff_id")
    token_version = payload.get("token_version")
    if not staff_id or token_version is None:
        return None

    result = await db.execute(select(StaffUser).where(StaffUser.id == staff_id))
    staff = result.scalar_one_or_none()
    if (
        not staff
        or staff.status != StaffStatus.ACTIVE
        or staff.token_version != token_version
        or staff.role not in StaffRole.ALL
    ):
        return None
    context = staff_to_dict(staff)
    set_user_id(staff.id)
    return context


async def get_authenticated_staff(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resolve an active staff token, including password-reset-only sessions."""

    if not credentials:
        raise _unauthorized("请先登录后台账号")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise _unauthorized()
    staff = await _resolve_staff_payload(db, payload)
    if not staff:
        raise _unauthorized("后台账号凭证已失效")
    return staff


async def get_current_staff(
    staff: dict = Depends(get_authenticated_staff),
) -> dict:
    if staff.get("force_password_reset"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="首次登录或密码重置后必须先修改密码",
        )
    return staff


def require_staff_roles(*roles: str) -> Callable:
    allowed = frozenset(roles)
    if not allowed or not allowed.issubset(StaffRole.ALL):
        raise ValueError("require_staff_roles 收到无效角色")

    async def dependency(staff: dict = Depends(get_current_staff)) -> dict:
        if staff.get("role") not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="当前后台角色无权执行此操作",
            )
        return staff

    return dependency


require_super_admin = require_staff_roles(StaffRole.SUPER_ADMIN)
require_commerce_operator = require_staff_roles(StaffRole.SUPER_ADMIN, StaffRole.OPERATOR)
require_any_staff = require_staff_roles(*StaffRole.ALL)


async def get_current_admin(
    request: Request,
    staff: dict = Depends(get_current_staff),
) -> dict:
    """Compatibility dependency for older admin routes.

    This closes legacy routes against the same fixed matrix used by new routes.
    New commerce routes still use explicit role dependencies.
    """

    role = staff["role"]
    if role == StaffRole.SUPER_ADMIN:
        return staff
    path = request.url.path

    # Settings, updater/release control and audit data are super-admin only,
    # including reads. Operational run logs are intentionally not audit logs.
    super_only_prefixes = (
        "/api/settings",
        "/api/updates",
        "/api/tool-releases",
        "/api/freight-rate-packs",
        "/api/audit",
        "/api/audit-logs",
    )
    if path.startswith(super_only_prefixes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该模块仅超级管理员可访问",
        )

    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return staff

    operator_mutation_prefixes = (
        "/api/auth-codes",
        "/api/users",
        "/api/devices/unbind",
        "/api/feedback",
        "/api/knowledge",
        "/api/ai-chat",
        "/api/dashboard/refresh-cache",
    )
    if role == StaffRole.OPERATOR:
        if path.startswith(operator_mutation_prefixes):
            return staff
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="运营角色对该模块仅可查看",
        )

    support_mutation_prefixes = (
        "/api/announcements",
        "/api/feedback",
        "/api/knowledge",
        "/api/ai-chat",
    )
    if role == StaffRole.SUPPORT and (
        path.startswith(support_mutation_prefixes)
        or path == "/api/devices/unbind"
    ):
        return staff
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="当前后台角色无权执行此操作",
    )


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict | None:
    if not credentials:
        return None
    payload = verify_token(credentials.credentials)
    if not payload:
        return None

    staff = await _resolve_staff_payload(db, payload)
    if staff:
        return staff

    user_id = payload.get("user_id")
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None
    set_user_id(user.id)
    return {
        "user_id": user.id,
        "role": "user",
        "auth_code_id": user.auth_code_id,
        "device_id": payload.get("device_id"),
    }


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not credentials:
        raise _unauthorized("请先登录")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise _unauthorized()

    staff = await _resolve_staff_payload(db, payload)
    if staff:
        return staff

    user_id = payload.get("user_id")
    if not user_id:
        raise _unauthorized("Token 数据无效")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise _unauthorized("用户不存在或已停用")
    set_user_id(user.id)
    return {
        "user_id": user.id,
        "role": "user",
        "auth_code_id": user.auth_code_id,
        "device_id": payload.get("device_id"),
    }


async def verify_auth_code_active(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    auth_code_id = current_user.get("auth_code_id")
    if not auth_code_id:
        return current_user
    result = await db.execute(select(AuthCode).where(AuthCode.id == auth_code_id))
    auth_code = result.scalar_one_or_none()
    if not auth_code:
        raise HTTPException(status_code=403, detail="授权码不存在")
    if auth_code.status != "active":
        raise HTTPException(status_code=403, detail=f"授权码状态异常: {auth_code.status}")
    return current_user
