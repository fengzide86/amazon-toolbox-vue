"""认证请求与响应契约。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from schemas.staff import StaffContextResponse, StaffSessionResponse


class VerifyRequest(BaseModel):
    code: str
    device_id: str
    device_name: str


class EntitlementsResponse(BaseModel):
    """标准产品权益。

    历史套餐可能包含扩展权益，因此在固化已知字段的同时保留额外键。
    """

    batch_execution: bool
    multi_account_workspace: bool
    desktop_notification: bool
    usage_metering: bool
    max_batch_rows: int
    max_open_sessions: int

    model_config = ConfigDict(extra="allow")


class VerifyData(BaseModel):
    token: str
    user_id: int
    code: str
    plan_name: str
    plan_code: str | None = None
    expires_at: str | None = None
    device_id: str | None = None
    platform_scope: list[str]
    scene_type: str | None = None
    seat_limit: int
    seat_used: int
    max_devices: int
    device_used: int
    product_type: str
    entitlements: EntitlementsResponse
    business_workspace_enabled: bool


class VerifyResponse(BaseModel):
    success: bool
    message: str
    data: VerifyData | None = None
    error_code: int | None = None


class AdminLoginRequest(BaseModel):
    username: str = "admin"
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    message: str
    data: StaffSessionResponse | None = None
    error_code: int | None = None


class UserAuthStatusData(BaseModel):
    role: Literal["user"]
    plan_name: str
    expires_at: str | None = None
    product_type: str
    entitlements: EntitlementsResponse
    business_workspace_enabled: bool
    seat_limit: int
    seat_used: int
    max_devices: int
    device_used: int


class LegacyAdminStatusData(BaseModel):
    role: Literal["admin"]


class AuthStatusResponse(BaseModel):
    success: bool
    message: str
    data: StaffContextResponse | UserAuthStatusData | LegacyAdminStatusData | None = None
    error_code: int | None = None


class UserInfoData(BaseModel):
    user_id: int
    role: Literal["user"]
    name: str
    device_id: str | None = None
    device_name: str | None = None
    plan_name: str
    expires_at: str | None = None
    product_type: str
    entitlements: EntitlementsResponse
    business_workspace_enabled: bool


class LegacyAdminUserInfoData(BaseModel):
    user_id: int
    role: Literal["admin"]
    name: str


class CurrentUserInfoResponse(BaseModel):
    success: bool
    message: str
    data: StaffContextResponse | UserInfoData | LegacyAdminUserInfoData | None = None
    error_code: int | None = None


class RefreshTokenData(BaseModel):
    token: str


class RefreshTokenResponse(BaseModel):
    success: Literal[True]
    data: RefreshTokenData
