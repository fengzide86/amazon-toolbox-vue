"""
反馈/日志相关 Schema
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LogCreate(BaseModel):
    user_id: int | None = None
    device_id: str | None = None
    tool_name: str | None = None
    module: str | None = None
    status: str | None = None
    error_code: str | None = None
    detail: str | None = None


class LogResponse(BaseModel):
    id: int
    user_id: int | None = None
    device_id: str | None = None
    tool_name: str | None = None
    module: str | None = None
    status: str | None = None
    error_code: str | None = None
    detail: str | None = None
    created_at: datetime | None = None
    verification_state: str = "legacy_unverified"

    model_config = ConfigDict(from_attributes=True)


class FeedbackCreate(BaseModel):
    user_id: int | None = None
    title: str | None = None
    content: str | None = None
    screenshot: str | None = None


class FeedbackUpdate(BaseModel):
    status: str | None = None
    admin_reply: str | None = None


class FeedbackResponse(BaseModel):
    id: int
    user_id: int | None = None
    title: str | None = None
    content: str | None = None
    screenshot: str | None = None
    status: str
    admin_reply: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
