"""
用户相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    total_seats: Optional[int] = None
    extra_devices: Optional[int] = None


class UserResponse(BaseModel):
    id: int
    name: Optional[str] = None
    phone: Optional[str] = None
    auth_code_id: Optional[int] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    total_seats: int
    extra_devices: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)