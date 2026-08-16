from __future__ import annotations

from pydantic import BaseModel


class AdminDeviceResponse(BaseModel):
    id: int
    auth_code_id: int
    auth_code: str
    device_id: str
    device_name: str
    created_at: str | None = None


class AdminDevicePageResponse(BaseModel):
    data: list[AdminDeviceResponse]
    page: int
    page_size: int
    total: int


class UserDeviceResponse(BaseModel):
    id: int
    device_id: str
    device_name: str
    created_at: str | None = None
    is_current: bool


class DeviceUnbindResponse(BaseModel):
    success: bool
    message: str
