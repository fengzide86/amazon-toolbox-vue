"""Internal company expense ledger and recurring renewal models."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from models.base import Base


class ExpenseCategoryStatus:
    ACTIVE = "active"
    ARCHIVED = "archived"
    ALL = frozenset({ACTIVE, ARCHIVED})


class ExpenseRecordStatus:
    ACTIVE = "active"
    VOIDED = "voided"
    ALL = frozenset({ACTIVE, VOIDED})


class ExpenseRenewalStatus:
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    ALL = frozenset({ACTIVE, PAUSED, ENDED})


class ExpenseRenewalCycle:
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"
    ALL = frozenset({MONTHLY, QUARTERLY, SEMIANNUAL, ANNUAL})


class ExpenseOccurrenceStatus:
    PAID = "paid"
    SKIPPED = "skipped"
    ALL = frozenset({PAID, SKIPPED})


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(80), nullable=False, unique=True)
    name = Column(String(100), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default=ExpenseCategoryStatus.ACTIVE, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_system = Column(Boolean, nullable=False, default=False)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_expense_categories_status"),
        Index("ix_expense_categories_status_sort", "status", "sort_order"),
    )


class ExpenseRenewal(Base):
    __tablename__ = "expense_renewals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    vendor = Column(String(200), nullable=True)
    default_amount = Column(Numeric(precision=12, scale=2), nullable=False)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    cycle = Column(String(20), nullable=False)
    next_due_on = Column(Date, nullable=False, index=True)
    reminder_days = Column(Integer, nullable=False, default=7)
    anchor_day = Column(Integer, nullable=False)
    anchor_month_end = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), nullable=False, default=ExpenseRenewalStatus.ACTIVE, index=True)
    note = Column(Text, nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    updated_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    paused_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("default_amount > 0", name="ck_expense_renewals_amount_positive"),
        CheckConstraint("reminder_days >= 0 AND reminder_days <= 90", name="ck_expense_renewals_reminder_days"),
        CheckConstraint("anchor_day >= 1 AND anchor_day <= 31", name="ck_expense_renewals_anchor_day"),
        CheckConstraint(
            "cycle IN ('monthly', 'quarterly', 'semiannual', 'annual')",
            name="ck_expense_renewals_cycle",
        ),
        CheckConstraint(
            "status IN ('active', 'paused', 'ended')",
            name="ck_expense_renewals_status",
        ),
        Index("ix_expense_renewals_status_due", "status", "next_due_on"),
    )


class ExpenseRecord(Base):
    __tablename__ = "expense_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    amount = Column(Numeric(precision=12, scale=2), nullable=False)
    currency = Column(String(3), nullable=False, default="CNY", server_default="CNY")
    expense_date = Column(Date, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    payee = Column(String(200), nullable=True)
    note = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default=ExpenseRecordStatus.ACTIVE, index=True)
    renewal_id = Column(Integer, ForeignKey("expense_renewals.id"), nullable=True, index=True)
    renewal_due_on = Column(Date, nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)
    updated_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    voided_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    voided_at = Column(DateTime, nullable=True)
    void_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expense_records_amount_positive"),
        CheckConstraint("currency = 'CNY'", name="ck_expense_records_currency"),
        CheckConstraint("status IN ('active', 'voided')", name="ck_expense_records_status"),
        UniqueConstraint("renewal_id", "renewal_due_on", name="ux_expense_records_renewal_due"),
        Index("ix_expense_records_status_date", "status", "expense_date"),
        Index("ix_expense_records_category_date", "category_id", "expense_date"),
    )


class ExpenseAttachment(Base):
    __tablename__ = "expense_attachments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    expense_id = Column(Integer, ForeignKey("expense_records.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key = Column(String(255), nullable=False, unique=True)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)
    uploaded_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="ck_expense_attachments_size_positive"),
        Index("ix_expense_attachments_expense_created", "expense_id", "created_at"),
    )


class ExpenseRenewalOccurrence(Base):
    __tablename__ = "expense_renewal_occurrences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    renewal_id = Column(Integer, ForeignKey("expense_renewals.id"), nullable=False, index=True)
    due_on = Column(Date, nullable=False)
    status = Column(String(20), nullable=False)
    expense_id = Column(Integer, ForeignKey("expense_records.id"), nullable=True, unique=True)
    note = Column(Text, nullable=True)
    processed_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    processed_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("status IN ('paid', 'skipped')", name="ck_expense_occurrences_status"),
        UniqueConstraint("renewal_id", "due_on", name="ux_expense_occurrences_renewal_due"),
        Index("ix_expense_occurrences_renewal_processed", "renewal_id", "processed_at"),
    )
