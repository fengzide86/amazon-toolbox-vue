"""
Pydantic Schema 模块 - 统一导出所有 schema

模块化结构:
- auth.py: 认证相关 schema
- plan.py: 套餐相关 schema
- auth_code.py: 授权码相关 schema
- order.py: 订单相关 schema
- user.py: 用户相关 schema
- feedback.py: 反馈/日志相关 schema
- profit.py: 分润相关 schema
- dashboard.py: 看板相关 schema
- system.py: 系统设置/公告相关 schema
"""

# 认证相关
from schemas.auth import (
    VerifyRequest,
    VerifyResponse,
    AdminLoginRequest,
    AdminLoginResponse,
)

# 套餐相关
from schemas.plan import (
    PlanCreate,
    PlanUpdate,
    PlanResponse,
)

# 授权码相关
from schemas.auth_code import (
    DeviceResponse,
    AuthCodeGenerate,
    AuthCodeUpdate,
    AuthCodeResponse,
    AuthSeatResponse,
)

# 订单相关
from schemas.order import (
    OrderCreate,
    OrderUpdate,
    OrderResponse,
)

# 用户相关
from schemas.user import (
    UserUpdate,
    UserResponse,
)

# 反馈/日志相关
from schemas.feedback import (
    LogCreate,
    LogResponse,
    FeedbackCreate,
    FeedbackUpdate,
    FeedbackResponse,
)

# 分润相关
from schemas.profit import ProfitRecordResponse

# 看板相关
from schemas.dashboard import DashboardData

# 系统设置/公告相关
from schemas.system import (
    SettingUpdate,
    SettingResponse,
    AnnouncementCreate,
    AnnouncementUpdate,
    AnnouncementOut,
)

# AI客服相关
from schemas.ai_chat import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
    KnowledgeBaseResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatConfigUpdate,
    ChatConfigResponse,
)

__all__ = [
    # 认证
    "VerifyRequest",
    "VerifyResponse",
    "AdminLoginRequest",
    "AdminLoginResponse",
    # 套餐
    "PlanCreate",
    "PlanUpdate",
    "PlanResponse",
    # 授权码
    "DeviceResponse",
    "AuthCodeGenerate",
    "AuthCodeUpdate",
    "AuthCodeResponse",
    "AuthSeatResponse",
    # 订单
    "OrderCreate",
    "OrderUpdate",
    "OrderResponse",
    # 用户
    "UserUpdate",
    "UserResponse",
    # 反馈/日志
    "LogCreate",
    "LogResponse",
    "FeedbackCreate",
    "FeedbackUpdate",
    "FeedbackResponse",
    # 分润
    "ProfitRecordResponse",
    # 看板
    "DashboardData",
    # 系统
    "SettingUpdate",
    "SettingResponse",
    "AnnouncementCreate",
    "AnnouncementUpdate",
    "AnnouncementOut",
    # AI客服
    "KnowledgeBaseCreate",
    "KnowledgeBaseUpdate",
    "KnowledgeBaseResponse",
    "ChatSessionCreate",
    "ChatSessionResponse",
    "ChatMessageCreate",
    "ChatMessageResponse",
    "ChatConfigUpdate",
    "ChatConfigResponse",
]
