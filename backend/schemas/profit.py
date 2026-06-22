"""
分润相关 Schema
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ProfitRecordResponse(BaseModel):
    id: int
    order_id: Optional[int] = None
    tech_share: float = 0
    market_share: float = 0
    product_share: float = 0
    service_share: float = 0
    coordination_share: float = 0
    record_share: float = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)