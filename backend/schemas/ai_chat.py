"""
AI客服相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


# ===== KnowledgeBase =====
class KnowledgeBaseCreate(BaseModel):
    title: str
    content: str
    category: str
    keywords: Optional[List[str]] = None
    priority: str = "medium"
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None


class KnowledgeBaseUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    keywords: Optional[List[str]] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None


class KnowledgeBaseResponse(BaseModel):
    id: int
    title: str
    content: str
    category: str
    keywords: Optional[List[str]] = None
    priority: str
    status: str
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None
    view_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatSession =====
class ChatSessionCreate(BaseModel):
    user_id: Optional[int] = None
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None


class ChatSessionResponse(BaseModel):
    id: int
    session_id: str
    user_id: Optional[int] = None
    status: str
    message_count: int = 0
    ai_resolved: bool = False
    transferred_to_human: bool = False
    satisfaction: Optional[int] = None
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatMessage =====
class ChatMessageCreate(BaseModel):
    session_id: str
    role: str  # user/ai/system
    content: str
    knowledge_ids: Optional[List[str]] = None


class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    knowledge_ids: Optional[List[str]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ===== ChatConfig =====
class ChatConfigUpdate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class ChatConfigResponse(BaseModel):
    id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)