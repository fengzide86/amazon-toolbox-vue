from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ===== Auth =====
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


# ===== Plans =====
class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    features: Optional[str] = None
    status: str = "active"
    code_prefix: Optional[str] = None  # 授权码前缀


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    duration_days: Optional[int] = None
    features: Optional[str] = None
    status: Optional[str] = None
    code_prefix: Optional[str] = None  # 授权码前缀


class PlanResponse(BaseModel):
    id: int
    name: str
    price: float
    duration_days: int
    features: Optional[str] = None
    status: str
    code_prefix: Optional[str] = None  # 授权码前缀
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Auth Codes =====
class DeviceResponse(BaseModel):
    id: int
    device_id: str
    device_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuthCodeGenerate(BaseModel):
    plan_id: Optional[int] = None
    count: int = 1
    duration_days: Optional[int] = None
    max_devices: Optional[int] = None


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

    class Config:
        from_attributes = True


# ===== Orders =====
class OrderCreate(BaseModel):
    plan_id: Optional[int] = None
    amount: float
    channel: Optional[str] = None
    responsible: Optional[str] = None
    status: str = "pending"


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    refund_amount: Optional[float] = None


class OrderResponse(BaseModel):
    id: int
    order_no: str
    plan_id: Optional[int] = None
    amount: float
    channel: Optional[str] = None
    responsible: Optional[str] = None
    status: str
    refund_amount: float
    created_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Users =====
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

    class Config:
        from_attributes = True


# ===== Run Logs =====
class LogCreate(BaseModel):
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    tool_name: Optional[str] = None
    module: Optional[str] = None
    status: Optional[str] = None
    error_code: Optional[str] = None
    detail: Optional[str] = None


class LogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    device_id: Optional[str] = None
    tool_name: Optional[str] = None
    module: Optional[str] = None
    status: Optional[str] = None
    error_code: Optional[str] = None
    detail: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Feedback =====
class FeedbackCreate(BaseModel):
    user_id: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    screenshot: Optional[str] = None


class FeedbackUpdate(BaseModel):
    status: Optional[str] = None
    admin_reply: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    screenshot: Optional[str] = None
    status: str
    admin_reply: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Profit =====
class ProfitRecordResponse(BaseModel):
    id: int
    order_id: Optional[int] = None
    tech_share: float
    market_share: float
    product_share: float
    service_share: float
    coordination_share: float
    record_share: float
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Settings =====
class SettingUpdate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class SettingResponse(BaseModel):
    id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== Dashboard =====
class DashboardData(BaseModel):
    total_revenue: float
    total_orders: int
    active_codes: int
    total_users: int
    today_runs: int
    pending_tickets: int
    recent_logs: List[dict]


# ===== Announcements =====
class AnnouncementCreate(BaseModel):
    title: str
    content: str
    type: Optional[str] = "info"
    status: Optional[str] = "draft"
    priority: Optional[int] = 0
    expires_at: Optional[datetime] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    expires_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    type: str
    status: str
    priority: int
    expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
