"""Authorization-code administration read models and transactions."""

from __future__ import annotations

import random
import string
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.audit import log_admin_action
from core.exceptions import NotFoundException
from models import AuthCode, AuthSeat, Device, Plan
from schemas import AuthCodeGenerate, AuthCodeResponse, AuthCodeUpdate

from .entitlements import normalize_entitlements


def _parse_platform_scope(scope: str | None) -> list[str]:
    if not scope:
        return ["amazon"]
    return [part.strip() for part in scope.split(",") if part.strip()]


async def _seat_used(db: AsyncSession, auth_code_id: int) -> int:
    result = await db.execute(
        select(func.count(AuthSeat.id)).where(
            AuthSeat.auth_code_id == auth_code_id,
            AuthSeat.status == "active",
        )
    )
    return int(result.scalar() or 0)


async def _device_used(db: AsyncSession, auth_code_id: int) -> int:
    result = await db.execute(select(func.count(Device.id)).where(Device.auth_code_id == auth_code_id))
    return int(result.scalar() or 0)


async def build_response(db: AsyncSession, code: AuthCode) -> AuthCodeResponse:
    plan_row = (
        await db.execute(
            select(Plan.name, Plan.product_type, Plan.entitlements).where(Plan.id == code.plan_id)
        )
    ).first()
    plan_name = plan_row[0] if plan_row else "未关联套餐"
    product_type = (plan_row[1] if plan_row else None) or "consumer"
    plan_entitlements = plan_row[2] if plan_row else None
    return AuthCodeResponse(
        id=code.id,
        code=code.code,
        plan_id=code.plan_id,
        user_id=code.user_id,
        device_id=code.device_id,
        device_name=code.device_name,
        max_devices=code.max_devices,
        status=code.status,
        expires_at=code.expires_at,
        created_at=code.created_at,
        devices=code.devices,
        platform_scope=_parse_platform_scope(code.platform_scope),
        scene_type=code.scene_type,
        seat_limit=code.seat_limit,
        seat_used=await _seat_used(db, code.id),
        device_used=await _device_used(db, code.id),
        plan_name=plan_name,
        product_type=product_type,
        entitlements=normalize_entitlements(plan_entitlements, product_type),
    )


async def list_codes(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    platform_key: str | None,
    include_deleted: bool,
) -> dict[str, object]:
    seat_subquery = (
        select(AuthSeat.auth_code_id, func.count(AuthSeat.id).label("seat_used"))
        .where(AuthSeat.status == "active")
        .group_by(AuthSeat.auth_code_id)
        .subquery()
    )
    device_subquery = (
        select(Device.auth_code_id, func.count(Device.id).label("device_used"))
        .group_by(Device.auth_code_id)
        .subquery()
    )
    query = (
        select(
            AuthCode,
            func.coalesce(seat_subquery.c.seat_used, 0).label("seat_used"),
            func.coalesce(device_subquery.c.device_used, 0).label("device_used"),
            Plan.name.label("plan_name"),
            Plan.product_type.label("product_type"),
            Plan.entitlements.label("plan_entitlements"),
        )
        .options(selectinload(AuthCode.devices))
        .outerjoin(seat_subquery, AuthCode.id == seat_subquery.c.auth_code_id)
        .outerjoin(device_subquery, AuthCode.id == device_subquery.c.auth_code_id)
        .outerjoin(Plan, AuthCode.plan_id == Plan.id)
    )
    count_query = select(func.count(AuthCode.id))
    if not include_deleted:
        query = query.where(AuthCode.status != "deleted")
        count_query = count_query.where(AuthCode.status != "deleted")
    if platform_key:
        query = query.where(AuthCode.platform_scope.contains(platform_key))
        count_query = count_query.where(AuthCode.platform_scope.contains(platform_key))
    count = int((await db.execute(count_query)).scalar() or 0)
    rows = (
        await db.execute(
            query.order_by(AuthCode.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    data = []
    for code, seat_used, device_used, plan_name, product_type, plan_entitlements in rows:
        resolved_product_type = product_type or "consumer"
        data.append(
            AuthCodeResponse(
                id=code.id,
                code=code.code,
                plan_id=code.plan_id,
                user_id=code.user_id,
                device_id=code.device_id,
                device_name=code.device_name,
                max_devices=code.max_devices,
                status=code.status,
                expires_at=code.expires_at,
                created_at=code.created_at,
                devices=code.devices,
                platform_scope=_parse_platform_scope(code.platform_scope),
                scene_type=code.scene_type,
                seat_limit=code.seat_limit,
                seat_used=seat_used or 0,
                device_used=device_used or 0,
                plan_name=plan_name or "未关联套餐",
                product_type=resolved_product_type,
                entitlements=normalize_entitlements(plan_entitlements, resolved_product_type),
            )
        )
    return {"data": data, "page": page, "page_size": page_size, "total": count}


async def get_code(db: AsyncSession, code_id: int) -> AuthCodeResponse:
    code = (
        await db.execute(
            select(AuthCode).options(selectinload(AuthCode.devices)).where(AuthCode.id == code_id)
        )
    ).scalars().first()
    if not code:
        raise NotFoundException("授权码不存在")
    return await build_response(db, code)


def _random_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


async def batch_generate(
    db: AsyncSession,
    request_data: AuthCodeGenerate,
    *,
    actor: dict[str, Any],
    request: Request,
) -> list[str]:
    plan_name = "UNKNOWN"
    code_prefix: str | None = None
    expires_at: datetime | None = None
    if request_data.plan_id:
        plan = (
            await db.execute(select(Plan).where(Plan.id == request_data.plan_id))
        ).scalars().first()
        if plan:
            code_prefix = plan.code_prefix
            plan_name = plan.name.split()[0] if plan.name else "UNKNOWN"
            duration_days = request_data.duration_days or plan.duration_days
            expires_at = datetime.now() + timedelta(days=duration_days)
    elif request_data.duration_days:
        expires_at = datetime.now() + timedelta(days=request_data.duration_days)

    prefix = code_prefix or plan_name
    date_text = datetime.now().strftime("%m%d")
    codes: list[str] = []
    for _ in range(request_data.count):
        code_text = f"{prefix}-{date_text}-{_random_code()}"
        db.add(
            AuthCode(
                code=code_text,
                plan_id=request_data.plan_id,
                status="unused",
                expires_at=expires_at,
                max_devices=request_data.max_devices or 1,
                platform_scope=request_data.platform_scope or "amazon",
                scene_type=request_data.scene_type or "competition",
                seat_limit=request_data.seat_limit or request_data.max_devices or 1,
            )
        )
        codes.append(code_text)
    await db.flush()
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="batch_create_auth_codes",
        target_type="auth_code",
        detail={
            "role": actor.get("role"),
            "before": None,
            "after": {"count": request_data.count, "prefix": prefix, "codes": codes[:5]},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    return codes


async def update_code(
    db: AsyncSession,
    code_id: int,
    request_data: AuthCodeUpdate,
    *,
    actor: dict[str, Any],
    request: Request,
) -> AuthCodeResponse:
    code = (
        await db.execute(
            select(AuthCode).options(selectinload(AuthCode.devices)).where(AuthCode.id == code_id)
        )
    ).scalars().first()
    if not code:
        raise NotFoundException("授权码不存在")
    before = {
        "code": code.code,
        "plan_id": code.plan_id,
        "status": code.status,
        "expires_at": code.expires_at,
        "max_devices": code.max_devices,
        "platform_scope": code.platform_scope,
        "scene_type": code.scene_type,
        "seat_limit": code.seat_limit,
    }
    changes = request_data.model_dump(exclude_none=True)
    for key, value in changes.items():
        if key == "expires_at" and isinstance(value, str):
            value = datetime.fromisoformat(value)
        setattr(code, key, value)
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="update_auth_code",
        target_type="auth_code",
        target_id=code_id,
        detail={
            "role": actor.get("role"),
            "before": before,
            "after": {**before, **changes},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
    return await build_response(db, code)


async def delete_code(
    db: AsyncSession,
    code_id: int,
    *,
    actor: dict[str, Any],
    request: Request,
) -> None:
    code = (await db.execute(select(AuthCode).where(AuthCode.id == code_id))).scalars().first()
    if not code:
        raise NotFoundException("授权码不存在")
    if code.status == "deleted":
        return
    previous_status = code.status
    code.status = "deleted"
    await db.execute(
        update(AuthSeat)
        .where(AuthSeat.auth_code_id == code_id, AuthSeat.status == "active")
        .values(status="inactive")
    )
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="delete_auth_code",
        target_type="auth_code",
        target_id=code_id,
        detail={
            "role": actor.get("role"),
            "before": {"code": code.code, "status": previous_status},
            "after": {"deleted": True, "status": "deleted"},
            "reason": None,
        },
        request=request,
    )
    await db.commit()
