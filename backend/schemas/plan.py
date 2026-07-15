"""
套餐相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime


class PlanCreate(BaseModel):
    name: str
    price: float
    duration_days: int
    features: Optional[str] = None
    status: str = "active"
    code_prefix: Optional[str] = None  # 授权码前缀
    product_type: str = "consumer"
    entitlements: Optional[Dict[str, Any]] = None


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    duration_days: Optional[int] = None
    features: Optional[str] = None
    status: Optional[str] = None
    code_prefix: Optional[str] = None  # 授权码前缀
    product_type: Optional[str] = None
    entitlements: Optional[Dict[str, Any]] = None


class PlanResponse(BaseModel):
    id: int
    name: str
    price: float
    duration_days: int
    features: Optional[str] = None
    status: str
    code_prefix: Optional[str] = None  # 授权码前缀
    product_type: str = "consumer"
    entitlements: Dict[str, Any] = {}
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
