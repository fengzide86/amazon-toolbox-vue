"""
订单相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class OrderCreate(BaseModel):
    plan_id: Optional[int] = None
    amount: float
    channel: Optional[str] = None
    responsible: Optional[str] = None
    status: str = "pending"


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    refund_amount: Optional[float] = None


class OrderResponse(BaseModel):
    id: int
    order_no: str
    plan_id: Optional[int] = None
    amount: float
    channel: Optional[str] = None
    responsible: Optional[str] = None
    status: str
    refund_amount: float
    platform_key: Optional[str] = None
    created_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)