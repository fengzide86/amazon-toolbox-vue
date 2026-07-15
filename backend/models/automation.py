"""B 端批量自动化的脱敏控制面模型。"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, func

from models.base import Base


class AutomationBatch(Base):
    __tablename__ = "automation_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_batch_id = Column(String(100), unique=True, nullable=False, index=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=False, index=True)
    tool_id = Column(String(100), nullable=False, index=True)
    tool_name = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="running", index=True)
    total_count = Column(Integer, nullable=False, default=0)
    pending_count = Column(Integer, nullable=False, default=0)
    running_count = Column(Integer, nullable=False, default=0)
    waiting_count = Column(Integer, nullable=False, default=0)
    completed_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)
    last_heartbeat_at = Column(DateTime, server_default=func.now(), index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_automation_batches_owner_status", "auth_code_id", "device_id", "status"),
        Index("ix_automation_batches_status_heartbeat", "status", "last_heartbeat_at"),
    )


class AutomationBatchItem(Base):
    __tablename__ = "automation_batch_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("automation_batches.id"), nullable=False, index=True)
    client_item_id = Column(String(100), nullable=False)
    account_label_masked = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="pending", index=True)
    intervention_type = Column(String(40), nullable=True, index=True)
    customer_message = Column(String(500), nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ux_automation_batch_item_client", "batch_id", "client_item_id", unique=True),
        Index("ix_automation_batch_items_status_updated", "status", "updated_at"),
    )
