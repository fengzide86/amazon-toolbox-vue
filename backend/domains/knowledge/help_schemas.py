"""用户帮助中心的只读响应契约。"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class HelpKnowledgeReference(BaseModel):
    id: int
    title: str
    content: str


class HelpQueryData(BaseModel):
    matched: bool
    ai_used: Literal[False]
    source: Literal["faq", "fallback"]
    answer_mode: Literal["faq", "fallback"]
    answer: str
    faq_id: int | None = None
    faq_title: str | None = None
    knowledge_refs: list[HelpKnowledgeReference] = Field(default_factory=list)
    need_ai: Literal[False]
    message: str | None = None


class HelpQueryResponse(BaseModel):
    success: bool
    message: str
    data: HelpQueryData | None = None


class FAQListItem(BaseModel):
    id: int
    category: str
    title: str
    content: str
    # 数据库中这是历史 JSON 字段；保留旧数据的合法 JSON 值。
    keywords: Any | None = None
    priority: str | None = None
    platform_key: str | None = None
    capability_key: str | None = None
    view_count: int | None = None
    created_at: str | None = None


class FAQListData(BaseModel):
    total: int
    items: list[FAQListItem]


class FAQListResponse(BaseModel):
    success: Literal[True]
    message: str
    data: FAQListData
