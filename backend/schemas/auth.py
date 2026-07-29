"""
认证相关 Schema
"""

from pydantic import BaseModel


class VerifyRequest(BaseModel):
    code: str
    device_id: str
    device_name: str


class VerifyResponse(BaseModel):
    success: bool
    message: str
    data: dict | None = None


class AdminLoginRequest(BaseModel):
    username: str = "admin"
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    message: str
    data: dict | None = None
