"""Immutable partner commission events and confirmed offline settlement receipts."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)

from models.base import Base


class AgencyCommissionSettlement(Base):
    __tablename__ = "agency_commission_settlements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    month = Column(String(7), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    count = Column(Integer, nullable=False)
    revision = Column(String(64), nullable=False)
    note = Column(String(1000), nullable=False)
    confirmed_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False)
    confirmed_at = Column(DateTime, nullable=False, server_default=func.now())
    __table_args__ = (
        UniqueConstraint("agency_id", "month", name="ux_agency_settlement_month"),
        CheckConstraint("amount >= 0", name="ck_agency_settlement_nonnegative"),
        CheckConstraint("count > 0", name="ck_agency_settlement_count"),
    )


class AgencyCommissionEntry(Base):
    __tablename__ = "agency_commission_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    order_no = Column(String(100), nullable=False)
    kind = Column(String(20), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    rate_snapshot = Column(Numeric(7, 6), nullable=False)
    order_amount_snapshot = Column(Numeric(12, 2), nullable=False)
    occurred_at = Column(DateTime, nullable=False, server_default=func.now())
    settlement_id = Column(Integer, ForeignKey("agency_commission_settlements.id"), nullable=True, index=True)
    __table_args__ = (
        UniqueConstraint("order_id", "kind", name="ux_agency_commission_order_kind"),
        CheckConstraint("kind IN ('accrual', 'refund')", name="ck_agency_commission_kind"),
        CheckConstraint("(kind = 'accrual' AND amount >= 0) OR (kind = 'refund' AND amount <= 0)", name="ck_agency_commission_sign"),
        CheckConstraint("rate_snapshot >= 0 AND rate_snapshot <= 1", name="ck_agency_commission_rate"),
        Index("ix_agency_commission_pending", "agency_id", "settlement_id", "occurred_at"),
    )
