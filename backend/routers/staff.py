"""Internal staff authentication and fixed-role account management."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.dependencies import get_authenticated_staff, require_super_admin
from core.security import hash_password_async, verify_password_fallback_async
from database import get_db
from models import StaffRole, StaffStatus, StaffUser
from schemas.staff import (
    StaffAccountCreate,
    StaffAccountResponse,
    StaffAccountUpdate,
    StaffLogin,
    StaffPasswordChange,
    StaffPasswordReset,
)
from services.staff_service import authenticate_staff, create_staff_access_token, staff_to_dict

router = APIRouter()


def _account_snapshot(staff: StaffUser) -> dict:
    return {
        "id": staff.id,
        "username": staff.username,
        "display_name": staff.display_name,
        "role": staff.role,
        "status": staff.status,
        "token_version": staff.token_version,
        "force_password_reset": bool(staff.force_password_reset),
    }


async def _active_super_admin_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(StaffUser.id)).where(
            StaffUser.role == StaffRole.SUPER_ADMIN,
            StaffUser.status == StaffStatus.ACTIVE,
        )
    )
    return int(result.scalar() or 0)


@router.post("/auth/login")
async def login(req: StaffLogin, request: Request, db: AsyncSession = Depends(get_db)):
    staff = await authenticate_staff(db, req.username, req.password, request=request)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号、密码或账号状态无效",
        )
    return {
        "success": True,
        "message": "登录成功",
        "data": {
            "token": create_staff_access_token(staff),
            **staff_to_dict(staff),
        },
    }


@router.get("/auth/me")
async def me(staff: dict = Depends(get_authenticated_staff)):
    return {"success": True, "message": "ok", "data": staff}


@router.post("/auth/change-password")
async def change_password(
    req: StaffPasswordChange,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_authenticated_staff),
):
    result = await db.execute(
        select(StaffUser).where(StaffUser.id == actor["staff_id"]).with_for_update()
    )
    staff = result.scalar_one()
    before = _account_snapshot(staff)
    valid, _ = await verify_password_fallback_async(req.current_password, staff.password_hash)
    if not valid:
        raise HTTPException(status_code=422, detail="当前密码不正确")
    if req.current_password == req.new_password:
        raise HTTPException(status_code=422, detail="新密码不能与当前密码相同")

    staff.password_hash = await hash_password_async(req.new_password)
    staff.force_password_reset = False
    staff.token_version += 1
    await log_admin_action(
        db,
        user_id=staff.id,
        user_name=staff.username,
        action="staff_change_password",
        target_type="staff_user",
        target_id=staff.id,
        detail={
            "role": staff.role,
            "before": before,
            "after": _account_snapshot(staff),
            "reason": "self_password_change",
        },
        request=request,
    )
    await db.commit()
    await db.refresh(staff)
    return {
        "success": True,
        "message": "密码已修改，其他登录凭证已失效",
        "data": {"token": create_staff_access_token(staff), **staff_to_dict(staff)},
    }


@router.post("/auth/logout")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_authenticated_staff),
):
    result = await db.execute(
        select(StaffUser).where(StaffUser.id == actor["staff_id"]).with_for_update()
    )
    staff = result.scalar_one()
    before = _account_snapshot(staff)
    staff.token_version += 1
    await log_admin_action(
        db,
        user_id=staff.id,
        user_name=staff.username,
        action="staff_logout",
        target_type="staff_user",
        target_id=staff.id,
        detail={
            "role": staff.role,
            "before": before,
            "after": _account_snapshot(staff),
            "reason": "explicit_logout",
        },
        request=request,
    )
    await db.commit()
    return {"success": True, "message": "已退出，当前账号全部旧凭证已失效"}


@router.get("/accounts")
async def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _actor: dict = Depends(require_super_admin),
):
    total_result = await db.execute(select(func.count(StaffUser.id)))
    total = int(total_result.scalar() or 0)
    result = await db.execute(
        select(StaffUser)
        .order_by(StaffUser.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    accounts = [
        StaffAccountResponse.model_validate(item).model_dump(mode="json")
        for item in result.scalars().all()
    ]
    return {
        "success": True,
        "message": "ok",
        "data": accounts,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def create_account(
    req: StaffAccountCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    account = StaffUser(
        username=req.username,
        display_name=req.display_name,
        password_hash=await hash_password_async(req.password),
        role=req.role,
        status=StaffStatus.ACTIVE,
        token_version=1,
        force_password_reset=True,
        created_by_staff_id=actor["staff_id"],
    )
    db.add(account)
    try:
        await db.flush()
        await log_admin_action(
            db,
            user_id=actor["staff_id"],
            user_name=actor["username"],
            action="staff_create",
            target_type="staff_user",
            target_id=account.id,
            detail={
                "role": actor["role"],
                "before": None,
                "after": _account_snapshot(account),
                "reason": "staff_account_create",
            },
            request=request,
        )
        await db.commit()
        await db.refresh(account)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="后台用户名已存在") from error
    return {
        "success": True,
        "message": "账号已创建；首次登录必须修改密码",
        "data": StaffAccountResponse.model_validate(account).model_dump(mode="json"),
    }


@router.patch("/accounts/{staff_id}")
async def update_account(
    staff_id: int,
    req: StaffAccountUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    result = await db.execute(
        select(StaffUser).where(StaffUser.id == staff_id).with_for_update()
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="后台账号不存在")
    changes = req.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="没有可更新字段")
    if staff_id == actor["staff_id"] and (
        ("role" in changes and changes["role"] != target.role)
        or ("status" in changes and changes["status"] != StaffStatus.ACTIVE)
    ):
        raise HTTPException(status_code=409, detail="不能停用自己或修改自己的角色")

    removing_active_super = (
        target.role == StaffRole.SUPER_ADMIN
        and target.status == StaffStatus.ACTIVE
        and (
            changes.get("role", target.role) != StaffRole.SUPER_ADMIN
            or changes.get("status", target.status) != StaffStatus.ACTIVE
        )
    )
    if removing_active_super and await _active_super_admin_count(db) <= 1:
        raise HTTPException(status_code=409, detail="必须至少保留一个启用的超级管理员")

    before = _account_snapshot(target)
    invalidates_token = False
    for field, value in changes.items():
        if getattr(target, field) != value:
            setattr(target, field, value)
            if field in {"role", "status"}:
                invalidates_token = True
    if invalidates_token:
        target.token_version += 1
    await log_admin_action(
        db,
        user_id=actor["staff_id"],
        user_name=actor["username"],
        action="staff_update",
        target_type="staff_user",
        target_id=target.id,
        detail={
            "role": actor["role"],
            "before": before,
            "after": _account_snapshot(target),
            "reason": "staff_account_update",
        },
        request=request,
    )
    await db.commit()
    await db.refresh(target)
    return {
        "success": True,
        "message": "账号已更新",
        "data": StaffAccountResponse.model_validate(target).model_dump(mode="json"),
    }


@router.post("/accounts/{staff_id}/reset-password")
async def reset_password(
    staff_id: int,
    req: StaffPasswordReset,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    if staff_id == actor["staff_id"]:
        raise HTTPException(status_code=409, detail="请使用修改密码接口更新自己的密码")
    result = await db.execute(
        select(StaffUser).where(StaffUser.id == staff_id).with_for_update()
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="后台账号不存在")
    before = _account_snapshot(target)
    target.password_hash = await hash_password_async(req.new_password)
    target.force_password_reset = True
    target.token_version += 1
    await log_admin_action(
        db,
        user_id=actor["staff_id"],
        user_name=actor["username"],
        action="staff_reset_password",
        target_type="staff_user",
        target_id=target.id,
        detail={
            "role": actor["role"],
            "before": before,
            "after": _account_snapshot(target),
            "reason": "super_admin_password_reset",
        },
        request=request,
    )
    await db.commit()
    return {"success": True, "message": "密码已重置；旧凭证已失效，首次登录必须修改密码"}
