"""
认证相关 Schema
"""
from pydantic import BaseModel
from typing import Optional


class VerifyRequest(BaseModel):
    code: str
    device_id: str
    device_name: str


class VerifyResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None


class AdminLoginRequest(BaseModel):
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None