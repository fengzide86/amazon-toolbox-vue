"""
系统相关数据模型
包含: Setting, Announcement, AuditLog
"""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func

from models.base import Base


# ===== 状态常量 =====
class AnnouncementStatus:
    """公告状态"""
    DRAFT = "draft"        # 草稿
    PUBLISHED = "published"  # 已发布
    EXPIRED = "expired"    # 已过期


# ===== 数据模型 =====

class Setting(Base):
    """系统设置（键值对）"""
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Announcement(Base):
    """公告"""
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String(20), default="info", index=True)  # info/warning/success/urgent
    audience = Column(String(20), nullable=False, default="all", index=True)
    category = Column(String(20), nullable=False, default="system", index=True)
    severity = Column(String(20), nullable=False, default="info", index=True)
    presentation = Column(String(20), nullable=False, default="banner")
    app_version = Column(String(50), nullable=True, index=True)
    status = Column(String(20), default="draft", index=True)  # draft/published/expired
    priority = Column(Integer, default=0)  # 优先级，越大越靠前
    starts_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # 过期时间
    published_at = Column(DateTime, nullable=True)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_announcements_status_priority', 'status', 'priority'),
        Index('ix_announcements_feed', 'status', 'audience', 'starts_at', 'expires_at'),
    )


class AnnouncementReceipt(Base):
    """按授权、设备和内容修订记录阅读状态，不保存客户业务数据。"""
    __tablename__ = "announcement_receipts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    announcement_id = Column(Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(200), nullable=False)
    revision = Column(Integer, nullable=False)
    read_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            'announcement_id', 'auth_code_id', 'device_id', 'revision',
            name='ux_announcement_receipt_scope',
        ),
    )


class AuditLog(Base):
    """审计日志 - 记录管理员关键操作"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_name = Column(String(100), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(100), nullable=True, index=True)
    target_id = Column(String(100), nullable=True, index=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    
    __table_args__ = (
        Index('ix_audit_logs_user_created', 'user_id', 'created_at'),
        Index('ix_audit_logs_action_created', 'action', 'created_at'),
    )
