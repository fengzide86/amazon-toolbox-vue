"""
授权码相关 Schema
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    device_name: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AuthCodeGenerate(BaseModel):
    plan_id: int | None = None
    count: int = 1
    duration_days: int | None = None
    max_devices: int | None = None
    platform_scope: str | None = "amazon"
    scene_type: str | None = "competition"
    seat_limit: int | None = None


class AuthCodeUpdate(BaseModel):
    status: str | None = None
    expires_at: str | None = None
    device_id: str | None = None
    device_name: str | None = None
    max_devices: int | None = None


class AuthCodeResponse(BaseModel):
    id: int
    code: str
    plan_id: int | None = None
    user_id: int | None = None
    device_id: str | None = None
    device_name: str | None = None
    max_devices: int | None = None
    status: str
    expires_at: datetime | None = None
    created_at: datetime | None = None
    devices: list[DeviceResponse] = []
    # 1.5 新增字段
    platform_scope: list[str] | None = None
    scene_type: str | None = None
    seat_limit: int | None = None
    seat_used: int | None = None
    device_used: int | None = None
    plan_name: str | None = None
    product_type: str = "consumer"
    entitlements: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class AuthCodePageResponse(BaseModel):
    data: list[AuthCodeResponse]
    page: int
    page_size: int
    total: int


class AuthCodeBatchGenerateResponse(BaseModel):
    success: bool
    codes: list[str]
    count: int


class AuthCodeDeleteResponse(BaseModel):
    success: bool


# ===== AuthSeat (席位) =====
class AuthSeatResponse(BaseModel):
    id: int
    auth_code_id: int
    user_id: int | None = None
    device_id: str | None = None
    device_name: str | None = None
    seat_no: int | None = None
    status: str
    activated_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
