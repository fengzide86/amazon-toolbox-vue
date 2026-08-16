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
# AI客服相关
from schemas.ai_chat import (
    AdminChatSessionsResponse,
    AdminChatStatsResponse,
    ChatActionResponse,
    ChatConfigResponse,
    ChatHistoryResponse,
    ChatMessageResponse,
    ChatReplyResponse,
    ChatSessionCreatedResponse,
    ChatSessionDetailResponse,
    ChatTransferResponse,
    CreateSessionRequest,
    DebugChatRequest,
    DebugChatResponse,
    KnowledgeBatchImportItem,
    KnowledgeBatchImportResponse,
    KnowledgeCategoryResponse,
    KnowledgeCreateRequest,
    KnowledgeDeleteResponse,
    KnowledgeListResponse,
    KnowledgeResponse,
    KnowledgeStatsResponse,
    KnowledgeUpdateRequest,
    RateSessionRequest,
    ResolveSessionRequest,
    RetrievalTestRequest,
    SendMessageRequest,
    UpdateChatConfigRequest,
)
from schemas.auth import (
    AdminLoginRequest,
    AdminLoginResponse,
    VerifyRequest,
    VerifyResponse,
)

# 授权码相关
from schemas.auth_code import (
    AuthCodeGenerate,
    AuthCodeResponse,
    AuthCodeUpdate,
    AuthSeatResponse,
    DeviceResponse,
)
from schemas.business import (
    BatchCreate,
    BatchFinish,
    BatchItemUpdate,
    BatchUpdate,
    BusinessBatchItemResponse,
    BusinessBatchResponse,
    BusinessBootstrapResponse,
)

# 看板相关
from schemas.dashboard import DashboardData

# 反馈/日志相关
from schemas.feedback import (
    FeedbackCreate,
    FeedbackResponse,
    FeedbackUpdate,
    LogCreate,
    LogResponse,
)

# 订单相关
from schemas.order import (
    OrderCreate,
    OrderResponse,
    OrderUpdate,
)

# 套餐相关
from schemas.plan import (
    PlanCreate,
    PlanResponse,
    PlanUpdate,
)

# 分润相关
from schemas.profit import ProfitRecordResponse

# 系统设置/公告相关
from schemas.system import (
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementUpdate,
    SettingResponse,
    SettingUpdate,
)

# 用户相关
from schemas.user import (
    UserResponse,
    UserUpdate,
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
    "KnowledgeCreateRequest",
    "KnowledgeUpdateRequest",
    "KnowledgeBatchImportItem",
    "RetrievalTestRequest",
    "KnowledgeResponse",
    "KnowledgeListResponse",
    "KnowledgeCategoryResponse",
    "KnowledgeStatsResponse",
    "KnowledgeDeleteResponse",
    "KnowledgeBatchImportResponse",
    "SendMessageRequest",
    "CreateSessionRequest",
    "DebugChatRequest",
    "ResolveSessionRequest",
    "RateSessionRequest",
    "UpdateChatConfigRequest",
    "ChatSessionCreatedResponse",
    "ChatSessionDetailResponse",
    "ChatMessageResponse",
    "ChatReplyResponse",
    "ChatActionResponse",
    "ChatTransferResponse",
    "ChatHistoryResponse",
    "DebugChatResponse",
    "ChatConfigResponse",
    "AdminChatSessionsResponse",
    "AdminChatStatsResponse",
    "BatchCreate",
    "BatchUpdate",
    "BatchItemUpdate",
    "BatchFinish",
    "BusinessBatchItemResponse",
    "BusinessBatchResponse",
    "BusinessBootstrapResponse",
]
