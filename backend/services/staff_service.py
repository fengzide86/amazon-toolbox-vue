"""Authentication helpers for internal staff accounts."""

from datetime import datetime, timedelta

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.logging import get_logger
from core.security import create_access_token, verify_password_fallback_async
from models import Setting, StaffRole, StaffStatus, StaffUser

logger = get_logger(__name__)


def staff_to_dict(staff: StaffUser) -> dict:
    return {
        "staff_id": staff.id,
        "user_id": staff.id,
        "username": staff.username,
        "name": staff.display_name,
        "display_name": staff.display_name,
        "role": staff.role,
        "status": staff.status,
        "token_version": staff.token_version,
        "force_password_reset": bool(staff.force_password_reset),
        "auth_code_id": None,
        "device_id": None,
    }


def create_staff_access_token(staff: StaffUser) -> str:
    return create_access_token(
        data={
            "token_type": "staff",
            "staff_id": staff.id,
            "user_id": staff.id,
            "role": staff.role,
            "token_version": staff.token_version,
            "auth_code_id": None,
        },
        expires_delta=timedelta(hours=8),
    )


async def authenticate_staff(
    db: AsyncSession,
    username: str,
    password: str,
    request: Request | None = None,
) -> StaffUser | None:
    result = await db.execute(
        select(StaffUser).where(StaffUser.username == username.strip().lower())
    )
    staff = result.scalar_one_or_none()
    if not staff or staff.status != StaffStatus.ACTIVE:
        return None

    is_valid, _ = await verify_password_fallback_async(password, staff.password_hash)
    if not is_valid:
        return None

    before_last_login = staff.last_login_at.isoformat() if staff.last_login_at else None
    staff.last_login_at = datetime.utcnow()
    if request is not None:
        await log_admin_action(
            db,
            user_id=staff.id,
            user_name=staff.username,
            action="staff_login",
            target_type="staff_user",
            target_id=staff.id,
            detail={
                "role": staff.role,
                "before": {"last_login_at": before_last_login},
                "after": {"last_login_at": staff.last_login_at.isoformat()},
                "reason": "credential_login",
            },
            request=request,
        )
    await db.commit()
    await db.refresh(staff)
    return staff


async def migrate_legacy_admin_password(db: AsyncSession) -> bool:
    """Move the old bcrypt setting into a real super-admin account once.

    Invalid/plaintext legacy values are deliberately discarded. Recovery then
    goes through ``python -m scripts.bootstrap_staff`` instead of an implicit
    default password.
    """

    result = await db.execute(select(Setting).where(Setting.key == "admin_password"))
    legacy = result.scalar_one_or_none()
    if not legacy:
        return False

    migrated = False
    value = (legacy.value or "").strip()
    existing_result = await db.execute(
        select(StaffUser).where(StaffUser.username == "admin")
    )
    existing = existing_result.scalar_one_or_none()
    if not existing and value.startswith(("$2a$", "$2b$", "$2y$")):
        db.add(
            StaffUser(
                username="admin",
                display_name="超级管理员",
                password_hash=value,
                role=StaffRole.SUPER_ADMIN,
                status=StaffStatus.ACTIVE,
                token_version=1,
                force_password_reset=True,
            )
        )
        migrated = True
        logger.warning("旧管理员密码哈希已迁移到 staff_users；首次登录后必须修改密码")
    elif not existing:
        logger.warning("旧管理员密码不是有效 bcrypt 哈希，已弃用；请运行 staff bootstrap 命令")

    await db.delete(legacy)
    await db.commit()
    return migrated
