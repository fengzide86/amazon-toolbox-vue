"""
AI客服相关 Schema
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ===== KnowledgeBase =====
class KnowledgeBaseCreate(BaseModel):
    title: str
    content: str
    category: str
    keywords: list[str] | None = None
    priority: str = "medium"
    platform_key: str | None = None
    capability_key: str | None = None


class KnowledgeBaseUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    keywords: list[str] | None = None
    priority: str | None = None
    status: str | None = None
    platform_key: str | None = None
    capability_key: str | None = None


class KnowledgeBaseResponse(BaseModel):
    id: int
    title: str
    content: str
    category: str
    keywords: list[str] | None = None
    priority: str
    status: str
    platform_key: str | None = None
    capability_key: str | None = None
    view_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatSession =====
class ChatSessionCreate(BaseModel):
    user_id: int | None = None
    platform_key: str | None = None
    capability_key: str | None = None


class ChatSessionResponse(BaseModel):
    id: int
    session_id: str
    user_id: int | None = None
    status: str
    message_count: int = 0
    ai_resolved: bool = False
    transferred_to_human: bool = False
    satisfaction: int | None = None
    platform_key: str | None = None
    capability_key: str | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatMessage =====
class ChatMessageCreate(BaseModel):
    session_id: str
    role: str  # user/ai/system
    content: str
    knowledge_ids: list[str] | None = None


class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    knowledge_ids: list[str] | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatConfig =====
class ChatConfigUpdate(BaseModel):
    key: str
    value: str
    description: str | None = None


class ChatConfigResponse(BaseModel):
    id: int
    key: str
    value: str | None = None
    description: str | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)