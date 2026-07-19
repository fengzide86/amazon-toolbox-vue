"""Validated plan schemas and explicit lifecycle requests."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    duration_days: int = Field(gt=0, le=3650)
    features: str | None = None
    code_prefix: str | None = Field(default=None, max_length=20)
    sort_order: int = Field(default=0, ge=-10000, le=10000)
    product_type: Literal["consumer", "business"] = "consumer"
    entitlements: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    duration_days: int | None = Field(default=None, gt=0, le=3650)
    features: str | None = None
    code_prefix: str | None = Field(default=None, max_length=20)
    sort_order: int | None = Field(default=None, ge=-10000, le=10000)
    product_type: Literal["consumer", "business"] | None = None
    entitlements: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class PlanResponse(BaseModel):
    id: int
    name: str
    price: Decimal
    duration_days: int
    features: str | None = None
    status: str
    code_prefix: str | None = None
    sort_order: int = 0
    product_type: str = "consumer"
    entitlements: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
