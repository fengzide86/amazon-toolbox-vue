"""
系统设置/公告相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)