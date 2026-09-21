"""Explicit scoped partner-workspace contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from core.response import APIResponse, PaginatedResponse
from core.timestamps import utc_iso


class AgencyTimestamps(BaseModel):
    @field_serializer("created_at", "paid_at", "resolved_at", check_fields=False)
    def serialize_timestamp(self, value: datetime | None) -> str | None:
        return utc_iso(value)


class AgencyWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    contact: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)


class AgencyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    contact: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "disabled"] | None = None


class AgencyView(AgencyWrite, AgencyTimestamps):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: Literal["active", "disabled"]
    created_at: datetime


class CustomerCreate(AgencyWrite):
    agency_id: int | None = Field(default=None, gt=0)


class CustomerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    contact: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    agency_id: int | None = Field(default=None, gt=0)


class CustomerView(AgencyWrite, AgencyTimestamps):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agency_id: int
    agency_name: str = ""
    created_at: datetime


class AgencyPlanView(BaseModel):
    id: int
    name: str
    price: float
    duration_days: int
    product_type: Literal["consumer", "business"]


class AgencyOrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    customer_id: int = Field(gt=0)
    plan_id: int = Field(gt=0)
    platform_key: Literal["amazon", "aliexpress"]
    note: str | None = Field(default=None, max_length=2000)


class AgencyLicenseView(AgencyTimestamps):
    id: int
    agency_id: int
    agency_name: str = ""
    customer_id: int
    customer_name: str = ""
    order_id: int
    code: str
    plan_name: str
    status: str
    expires_at: datetime | None = None
    activated: bool
    created_at: datetime

    @field_serializer("expires_at")
    def serialize_expiry(self, value: datetime | None) -> str | None:
        # Legacy authorization compares local naive wall time; do not reinterpret it as UTC.
        return value.astimezone().isoformat() if value is not None else None


class AgencyOrderView(AgencyTimestamps):
    id: int
    agency_id: int
    agency_name: str = ""
    customer_id: int
    customer_name: str
    order_no: str
    plan_id: int | None
    plan_name: str
    amount: float
    platform_key: str | None
    note: str | None
    status: Literal["pending", "paid", "refunded", "cancelled"]
    created_at: datetime
    paid_at: datetime | None
    auth_code: AgencyLicenseView | None


class AgencyRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    customer_id: int = Field(gt=0)
    order_id: int | None = Field(default=None, gt=0)
    kind: Literal["support", "refund", "extension"]
    content: str = Field(min_length=1, max_length=4000)


class AgencyRequestResolve(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: Literal["open", "resolved", "rejected"]
    response: str = Field(min_length=1, max_length=4000)


class AgencyRequestView(AgencyRequestCreate, AgencyTimestamps):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agency_id: int
    agency_name: str = ""
    customer_name: str = ""
    status: Literal["open", "resolved", "rejected"]
    response: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class AgencySummary(BaseModel):
    customers: int
    orders: int
    pending_orders: int
    delivered_orders: int
    open_requests: int


class AgencyEnvelope(APIResponse[AgencyView]):
    pass


class AgenciesEnvelope(PaginatedResponse[AgencyView]):
    pass


class CustomerEnvelope(APIResponse[CustomerView]):
    pass


class CustomersEnvelope(PaginatedResponse[CustomerView]):
    pass


class AgencyOrderEnvelope(APIResponse[AgencyOrderView]):
    pass


class AgencyOrdersEnvelope(PaginatedResponse[AgencyOrderView]):
    pass


class AgencyLicenseEnvelope(APIResponse[AgencyLicenseView]):
    pass


class AgencyLicensesEnvelope(PaginatedResponse[AgencyLicenseView]):
    pass


class AgencyRequestEnvelope(APIResponse[AgencyRequestView]):
    pass


class AgencyRequestsEnvelope(PaginatedResponse[AgencyRequestView]):
    pass


class AgencySummaryEnvelope(APIResponse[AgencySummary]):
    pass


class AgencyPlansEnvelope(APIResponse[list[AgencyPlanView]]):
    pass
