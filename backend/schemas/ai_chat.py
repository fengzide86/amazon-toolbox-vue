"""Explicit request and response contracts for knowledge and rules-based chat APIs."""

from typing import Any

from pydantic import BaseModel, Field

# ===== Knowledge base requests =====


class KnowledgeCreateRequest(BaseModel):
    category: str
    title: str
    content: str
    keywords: list[str] | None = None
    priority: str | None = "medium"
    platform_key: str | None = None
    capability_key: str | None = None


class KnowledgeUpdateRequest(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None
    keywords: list[str] | None = None
    priority: str | None = None
    status: str | None = None
    platform_key: str | None = None
    capability_key: str | None = None


class KnowledgeBatchImportItem(BaseModel):
    category: str
    title: str
    content: str
    keywords: list[str] | None = None
    priority: str | None = "medium"


class RetrievalTestRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    platform_key: str | None = None
    capability_key: str | None = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.3, ge=-1, le=1)


# ===== Knowledge base responses =====


class KnowledgeResponse(BaseModel):
    id: int
    category: str
    title: str
    content: str
    keywords: list[str]
    priority: str | None
    status: str | None
    vector_id: str | None
    view_count: int
    platform_key: str | None
    capability_key: str | None
    created_at: str | None
    updated_at: str | None


class KnowledgeListResponse(BaseModel):
    data: list[KnowledgeResponse]
    items: list[KnowledgeResponse]
    total: int
    page: int
    page_size: int


class KnowledgeCategoryResponse(BaseModel):
    name: str
    count: int


class KnowledgeVectorStoreResponse(BaseModel):
    enabled: bool
    reason: str


class KnowledgeStatsResponse(BaseModel):
    total: int
    active: int
    categories: int
    vector_store: KnowledgeVectorStoreResponse


class KnowledgeDeleteResponse(BaseModel):
    message: str


class KnowledgeBatchImportResponse(BaseModel):
    success: int
    failed: int
    errors: list[str]


class FeatureDisabledDetail(BaseModel):
    code: str
    message: str


class FeatureDisabledResponse(BaseModel):
    detail: FeatureDisabledDetail


# ===== Chat requests =====


class SendMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    platform_key: str | None = None
    capability_key: str | None = None


class CreateSessionRequest(BaseModel):
    platform_key: str | None = None
    capability_key: str | None = None


class DebugChatRequest(SendMessageRequest):
    """Rules-only preview input; legacy vector fields remain ignored as extras."""


class ResolveSessionRequest(BaseModel):
    satisfaction: int | None = None


class RateSessionRequest(BaseModel):
    satisfaction: int = Field(ge=1, le=5)


class UpdateChatConfigRequest(BaseModel):
    welcome_message: str | None = Field(default=None, max_length=1000)
    suggested_questions: list[str] | None = None
    max_unmatched: int | None = Field(default=None, ge=1, le=10)
    transfer_keywords: list[str] | None = None
    transfer_rules: dict[str, Any] | None = None


# ===== Chat responses =====


class ChatSessionCreatedResponse(BaseModel):
    session_id: str
    status: str
    welcome_message: str
    suggested_questions: list[str]


class ChatMessageResponse(BaseModel):
    role: str
    content: str
    knowledge_ids: list[str]
    created_at: str | None


class ChatSessionDetailResponse(BaseModel):
    session_id: str
    status: str
    message_count: int
    ai_resolved: bool
    transferred_to_human: bool
    satisfaction: int | None
    messages: list[ChatMessageResponse]
    created_at: str | None


class KnowledgeReferenceResponse(BaseModel):
    id: int
    knowledge_id: int
    title: str
    category: str
    content: str
    score: float
    platform_key: str | None
    capability_key: str | None


class ChatReplyResponse(BaseModel):
    session_id: str
    reply: str
    answer_mode: str
    ai_used: bool
    should_transfer: bool
    knowledge_refs: list[KnowledgeReferenceResponse]


class ChatActionResponse(BaseModel):
    message: str


class ChatTransferResponse(BaseModel):
    message: str
    feedback_id: int | None


class ChatHistoryItemResponse(BaseModel):
    session_id: str
    status: str
    message_count: int
    ai_resolved: bool
    satisfaction: int | None
    created_at: str | None


class ChatHistoryResponse(BaseModel):
    data: list[ChatHistoryItemResponse]
    items: list[ChatHistoryItemResponse]
    total: int
    page: int
    page_size: int


class ChatDiagnosticsResponse(BaseModel):
    total_ms: int | float


class DebugChatResponse(BaseModel):
    reply: str
    answer_mode: str
    ai_used: bool
    knowledge_refs: list[KnowledgeReferenceResponse]
    fallback_reason: str | None
    should_transfer: bool
    diagnostics: ChatDiagnosticsResponse


class ChatConfigResponse(BaseModel):
    welcome_message: str | None
    suggested_questions: str | None
    support_mode: str | None
    max_unmatched: str | None
    transfer_keywords: str | None
    transfer_rules: str | None


class AdminChatSessionItemResponse(BaseModel):
    session_id: str
    user_id: int | None
    user_name: str
    status: str
    message_count: int
    ai_resolved: bool
    transferred_to_human: bool
    satisfaction: int | None
    created_at: str | None
    resolved_at: str | None


class AdminChatSessionsResponse(BaseModel):
    data: list[AdminChatSessionItemResponse]
    items: list[AdminChatSessionItemResponse]
    total: int
    page: int
    page_size: int


class AdminChatStatsResponse(BaseModel):
    total_sessions: int
    resolved: int
    transferred: int
    resolve_rate: int | float
    transfer_rate: int | float
    avg_satisfaction: float | None
    today_sessions: int
