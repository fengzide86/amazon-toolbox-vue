"""
授权码相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class DeviceResponse(BaseModel):
    id: int
    device_id: str
    device_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AuthCodeGenerate(BaseModel):
    plan_id: Optional[int] = None
    count: int = 1
    duration_days: Optional[int] = None
    max_devices: Optional[int] = None
    platform_scope: Optional[str] = "amazon"
    scene_type: Optional[str] = "competition"
    seat_limit: Optional[int] = None


class AuthCodeUpdate(BaseModel):
    status: Optional[str] = None
    expires_at: Optional[str] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    max_devices: Optional[int] = None


class AuthCodeResponse(BaseModel):
    id: int
    code: str
    plan_id: Optional[int] = None
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    max_devices: Optional[int] = None
    status: str
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    devices: List[DeviceResponse] = []
    # 1.5 新增字段
    platform_scope: Optional[List[str]] = None
    scene_type: Optional[str] = None
    seat_limit: Optional[int] = None
    seat_used: Optional[int] = None
    device_used: Optional[int] = None
    plan_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ===== AuthSeat (席位) =====
class AuthSeatResponse(BaseModel):
    id: int
    auth_code_id: int
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    seat_no: Optional[int] = None
    status: str
    activated_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
