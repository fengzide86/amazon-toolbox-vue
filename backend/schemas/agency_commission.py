"""Scoped commission read models and owner-confirmed settlement contracts."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from core.response import APIResponse, PaginatedResponse
from core.timestamps import utc_iso


class CommissionPolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rate: Decimal | None = Field(ge=0, le=1, max_digits=7, decimal_places=6)
    expected_rate: Decimal | None = Field(ge=0, le=1, max_digits=7, decimal_places=6)


class CommissionPolicyView(BaseModel):
    agency_id: int
    rate: Decimal | None


class CommissionEntryView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agency_id: int
    order_id: int
    order_no: str
    kind: Literal["accrual", "refund"]
    amount: Decimal
    rate_snapshot: Decimal
    order_amount_snapshot: Decimal
    occurred_at: datetime
    settlement_id: int | None

    @field_serializer("occurred_at")
    def serialize_time(self, value: datetime) -> str | None:
        return utc_iso(value)


class CommissionSummaryView(BaseModel):
    pending_amount: Decimal
    settled_amount: Decimal
    accrued_amount: Decimal
    refunded_amount: Decimal


class CommissionSettlementView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agency_id: int
    month: str
    amount: Decimal
    count: int
    confirmed_at: datetime
    note: str

    @field_serializer("confirmed_at")
    def serialize_time(self, value: datetime) -> str | None:
        return utc_iso(value)


class CommissionSettlementPreview(BaseModel):
    agency_id: int
    month: str
    amount: Decimal
    count: int
    revision: str
    existing_settlement: CommissionSettlementView | None = None


class CommissionSettlementConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    expected_revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    note: str = Field(min_length=1, max_length=1000)


CommissionPolicyEnvelope = APIResponse[CommissionPolicyView]
CommissionEntriesEnvelope = PaginatedResponse[CommissionEntryView]
CommissionSummaryEnvelope = APIResponse[CommissionSummaryView]
CommissionSettlementsEnvelope = PaginatedResponse[CommissionSettlementView]
CommissionSettlementEnvelope = APIResponse[CommissionSettlementView]
CommissionSettlementPreviewEnvelope = APIResponse[CommissionSettlementPreview]
