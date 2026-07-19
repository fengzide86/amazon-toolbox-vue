"""Internal demo execution records.

Demo records deliberately live outside the real automation tables.  They
describe a UI walkthrough only and can never be interpreted as a verified
platform execution.
"""
from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)

from models.base import Base


class DemoRun(Base):
    __tablename__ = "demo_runs"

    id = Column(String(64), primary_key=True)
    idempotency_key = Column(String(120), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True, index=True)
    tool_id = Column(String(100), nullable=False, index=True)
    tool_name_snapshot = Column(String(200), nullable=False)
    platform_key = Column(String(50), nullable=False, index=True)
    scenario_id = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="created", index=True)
    event_seq = Column(Integer, nullable=False, default=0)
    current_step_id = Column(String(100), nullable=True)
    completed_step_count = Column(Integer, nullable=False, default=0)
    total_step_count = Column(Integer, nullable=False, default=1)
    simulated_outcome = Column(String(30), nullable=True)
    error_code = Column(String(100), nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('created','running','paused','completed','cancelled','error')",
            name="ck_demo_runs_status",
        ),
        CheckConstraint(
            "simulated_outcome IS NULL OR simulated_outcome IN "
            "('completed_example','attention_example','failure_example')",
            name="ck_demo_runs_outcome",
        ),
        UniqueConstraint("user_id", "idempotency_key", name="ux_demo_run_owner_idempotency"),
        Index("ix_demo_runs_owner_created", "user_id", "created_at"),
        Index("ix_demo_runs_owner_status", "user_id", "status"),
    )


class DemoBatch(Base):
    __tablename__ = "demo_batches"

    id = Column(String(64), primary_key=True)
    idempotency_key = Column(String(120), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True, index=True)
    tool_id = Column(String(100), nullable=False, index=True)
    tool_name_snapshot = Column(String(200), nullable=False)
    platform_key = Column(String(50), nullable=False, index=True)
    scenario_id = Column(String(100), nullable=False)
    row_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="created", index=True)
    event_seq = Column(Integer, nullable=False, default=0)
    queued_count = Column(Integer, nullable=False, default=0)
    playing_count = Column(Integer, nullable=False, default=0)
    played_count = Column(Integer, nullable=False, default=0)
    skipped_count = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('created','running','completed','cancelled','error')",
            name="ck_demo_batches_status",
        ),
        CheckConstraint("row_count > 0", name="ck_demo_batches_row_count"),
        UniqueConstraint("user_id", "idempotency_key", name="ux_demo_batch_owner_idempotency"),
        Index("ix_demo_batches_owner_created", "user_id", "created_at"),
        Index("ix_demo_batches_owner_status", "user_id", "status"),
    )


class DemoBatchItem(Base):
    __tablename__ = "demo_batch_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(64), ForeignKey("demo_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    item_ref = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="queued", index=True)
    simulated_outcome = Column(String(30), nullable=True)
    event_seq = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','playing','played','skipped','error')",
            name="ck_demo_batch_items_status",
        ),
        CheckConstraint(
            "simulated_outcome IS NULL OR simulated_outcome IN "
            "('completed_example','attention_example','failure_example')",
            name="ck_demo_batch_items_outcome",
        ),
        UniqueConstraint("batch_id", "item_ref", name="ux_demo_batch_item_ref"),
        Index("ix_demo_batch_items_batch_status", "batch_id", "status"),
    )
