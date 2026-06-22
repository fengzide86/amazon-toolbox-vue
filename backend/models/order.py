"""
订单相关数据模型
包含: Order, Plan, ProfitRecord
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, Numeric, func
from models.base import Base


# ===== 状态常量 =====
class OrderStatus:
    """订单状态"""
    PENDING = "pending"    # 待确认
    PAID = "paid"          # 已付款
    REFUNDED = "refunded"  # 已退款


class PlanStatus:
    """套餐状态"""
    ACTIVE = "active"      # 启用
    DISABLED = "disabled"  # 禁用
    DELETED = "deleted"    # 已删除


# ===== 数据模型 =====

class Plan(Base):
    """套餐"""
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(precision=10, scale=2), nullable=False)
    duration_days = Column(Integer, nullable=False)
    features = Column(Text, nullable=True)  # JSON字符串
    status = Column(String(20), default="active", index=True)  # active/disabled/deleted
    code_prefix = Column(String(20), nullable=True)  # 授权码前缀，如 "SVIP"
    sort_order = Column(Integer, default=0)  # 排序权重
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_plans_status_sort', 'status', 'sort_order'),
    )


class Order(Base):
    """订单"""
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_no = Column(String(100), unique=True, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True, index=True)
    amount = Column(Numeric(precision=10, scale=2), nullable=False)
    channel = Column(String(100), nullable=True)
    responsible = Column(String(100), nullable=True)
    status = Column(String(20), default="pending", index=True)  # pending/paid/refunded
    refund_amount = Column(Numeric(precision=10, scale=2), default=0)
    platform_key = Column(String(50), nullable=True, index=True)  # 平台标识: amazon/aliexpress
    created_at = Column(DateTime, server_default=func.now(), index=True)
    paid_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_orders_status_created', 'status', 'created_at'),
        Index('ix_orders_plan_status', 'plan_id', 'status'),
        Index('ix_orders_platform', 'platform_key'),
    )


class ProfitRecord(Base):
    """分润记录"""
    __tablename__ = "profit_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    tech_share = Column(Numeric(precision=10, scale=2), default=0)
    market_share = Column(Numeric(precision=10, scale=2), default=0)
    product_share = Column(Numeric(precision=10, scale=2), default=0)
    service_share = Column(Numeric(precision=10, scale=2), default=0)
    coordination_share = Column(Numeric(precision=10, scale=2), default=0)
    record_share = Column(Numeric(precision=10, scale=2), default=0)
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        Index('ix_profit_order', 'order_id'),
    )