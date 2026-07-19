"""Profit ledger and policy schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PROFIT_KEYS = ("tech", "market", "product", "service", "coordination", "record")


class ProfitRatios(BaseModel):
    tech: Decimal = Field(ge=0, le=1)
    market: Decimal = Field(ge=0, le=1)
    product: Decimal = Field(ge=0, le=1)
    service: Decimal = Field(ge=0, le=1)
    coordination: Decimal = Field(ge=0, le=1)
    record: Decimal = Field(ge=0, le=1)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_total(self) -> "ProfitRatios":
        total = sum((getattr(self, key) for key in PROFIT_KEYS), Decimal("0"))
        if total != Decimal("1"):
            raise ValueError("分润比例合计必须精确等于 1")
        return self


class ProfitPolicyUpdate(BaseModel):
    ratios: ProfitRatios

    model_config = ConfigDict(extra="forbid")


class ProfitPolicyResponse(BaseModel):
    version: int
    ratios: ProfitRatios


class ProfitRecordResponse(BaseModel):
    id: int
    order_id: int
    status: str
    policy_version: int
    ratios_snapshot: str
    order_amount_snapshot: Decimal
    tech_share: Decimal = Decimal("0")
    market_share: Decimal = Decimal("0")
    product_share: Decimal = Decimal("0")
    service_share: Decimal = Decimal("0")
    coordination_share: Decimal = Decimal("0")
    record_share: Decimal = Decimal("0")
    reversed_at: datetime | None = None
    reversal_reason: str | None = None
    created_by_staff_id: int | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
