"""Plan, order and immutable/reversible profit-ledger models."""

from sqlalchemy import (
    CheckConstraint,
    Column,
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


class OrderStatus:
    PENDING = "pending"
    PAID = "paid"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"

    ALL = frozenset({PENDING, PAID, REFUNDED, CANCELLED})


class PlanStatus:
    ACTIVE = "active"
    DISABLED = "disabled"
    ARCHIVED = "archived"

    # Kept as a source-compatibility constant only. New writes use ``archived``.
    DELETED = ARCHIVED
    ALL = frozenset({ACTIVE, DISABLED, ARCHIVED})


class ProfitStatus:
    ACTIVE = "active"
    REVERSED = "reversed"

    ALL = frozenset({ACTIVE, REVERSED})


class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    price = Column(Numeric(precision=10, scale=2), nullable=False)
    duration_days = Column(Integer, nullable=False)
    features = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default=PlanStatus.DISABLED, index=True)
    code_prefix = Column(String(20), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    product_type = Column(String(20), nullable=False, default="consumer", index=True)
    entitlements = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("price > 0", name="ck_plans_price_positive"),
        CheckConstraint("duration_days > 0", name="ck_plans_duration_positive"),
        CheckConstraint(
            "status IN ('active', 'disabled', 'archived')",
            name="ck_plans_status",
        ),
        CheckConstraint(
            "product_type IN ('consumer', 'business')",
            name="ck_plans_product_type",
        ),
        Index("ix_plans_status_sort", "status", "sort_order"),
    )


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_no = Column(String(100), unique=True, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True, index=True)
    plan_name_snapshot = Column(String(100), nullable=False, default="未关联套餐", server_default="未关联套餐")
    plan_price_snapshot = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    plan_duration_days_snapshot = Column(Integer, nullable=False, default=0, server_default="0")
    amount = Column(Numeric(precision=10, scale=2), nullable=False)
    channel = Column(String(100), nullable=True)
    responsible = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default=OrderStatus.PENDING, index=True)
    refund_amount = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    platform_key = Column(String(50), nullable=True, index=True)
    refund_reason = Column(String(500), nullable=True)
    cancel_reason = Column(String(500), nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True, index=True)
    updated_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    paid_at = Column(DateTime, nullable=True)
    refunded_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_orders_amount_positive"),
        CheckConstraint("refund_amount >= 0", name="ck_orders_refund_nonnegative"),
        CheckConstraint(
            "status IN ('pending', 'paid', 'refunded', 'cancelled')",
            name="ck_orders_status",
        ),
        Index("ix_orders_status_created", "status", "created_at"),
        Index("ix_orders_plan_status", "plan_id", "status"),
        Index("ix_orders_platform", "platform_key"),
    )


class ProfitRecord(Base):
    """A ledger entry. Refunds reverse it instead of deleting it."""

    __tablename__ = "profit_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    status = Column(String(20), nullable=False, default=ProfitStatus.ACTIVE, index=True)
    policy_version = Column(Integer, nullable=False, default=1, server_default="1")
    ratios_snapshot = Column(Text, nullable=False, default="{}", server_default="{}")
    order_amount_snapshot = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    tech_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    market_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    product_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    service_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    coordination_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    record_share = Column(Numeric(precision=10, scale=2), nullable=False, default=0, server_default="0")
    reversed_at = Column(DateTime, nullable=True)
    reversal_reason = Column(String(500), nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("order_id", name="ux_profit_records_order_id"),
        CheckConstraint(
            "status IN ('active', 'reversed')",
            name="ck_profit_records_status",
        ),
        CheckConstraint("order_amount_snapshot >= 0", name="ck_profit_order_amount_nonnegative"),
        Index("ix_profit_status_created", "status", "created_at"),
    )
