"""
用户相关 Schema
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    total_seats: int | None = None
    extra_devices: int | None = None


class UserResponse(BaseModel):
    id: int
    name: str | None = None
    phone: str | None = None
    auth_code_id: int | None = None
    device_id: str | None = None
    device_name: str | None = None
    total_seats: int
    extra_devices: int
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)