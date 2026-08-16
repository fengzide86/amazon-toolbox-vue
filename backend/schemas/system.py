"""
系统设置/公告相关 Schema
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SettingUpdate(BaseModel):
    key: str
    value: str
    description: str | None = None


class SettingResponse(BaseModel):
    id: int
    key: str
    value: str | None = None
    description: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    type: str | None = "info"
    status: str | None = "draft"
    priority: int | None = 0
    expires_at: datetime | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    type: str | None = None
    status: str | None = None
    priority: int | None = None
    expires_at: datetime | None = None


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    type: str
    status: str
    priority: int
    expires_at: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SettingUpdateResponse(BaseModel):
    success: bool
