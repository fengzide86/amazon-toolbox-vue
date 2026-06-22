"""
反馈/日志相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)