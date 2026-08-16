"""Device management routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_user
from core.logging import get_logger
from database import get_db
from domains.access import devices as device_service
from domains.access.device_schemas import (
    AdminDevicePageResponse,
    DeviceUnbindResponse,
    UserDeviceResponse,
)

logger = get_logger(__name__)
router = APIRouter()


@router.get("", response_model=AdminDevicePageResponse)
async def get_devices(
    auth_code_id: int | None = Query(None, description="授权码ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, object]:
    return await device_service.list_admin(
        db,
        auth_code_id=auth_code_id,
        page=page,
        page_size=page_size,
    )


@router.get("/my", response_model=list[UserDeviceResponse])
async def get_my_devices(
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[dict[str, object]]:
    return await device_service.list_for_user(db, current_user)


@router.post("/unbind", response_model=DeviceUnbindResponse)
async def unbind_device(
    request: Request,
    device_id: int = Query(..., description="设备记录ID"),
    reason: str = Query(..., min_length=2, max_length=500, description="解绑原因"),
    db: AsyncSession = Depends(get_db),
    actor: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, object]:
    device_name = await device_service.unbind_admin(
        db,
        device_id,
        reason,
        actor=actor,
        request=request,
    )
    logger.info("解绑设备: %s (ID: %s)", device_name, device_id)
    return {"success": True, "message": f"设备 {device_name} 已解绑"}


@router.post("/user-unbind", response_model=DeviceUnbindResponse)
async def user_unbind_device(
    device_id: int = Query(..., description="设备记录ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, object]:
    device_name = await device_service.unbind_user(db, device_id, current_user)
    logger.info("用户解绑设备: %s (ID: %s)", device_name, device_id)
    return {"success": True, "message": f"设备 {device_name} 已解绑"}
