from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

BatchStatus = Literal["running", "completed", "cancelled", "interrupted"]
ItemStatus = Literal["pending", "running", "waiting_user", "completed", "failed", "cancelled"]
InterventionType = Literal["login", "captcha", "two_factor", "page_confirmation", "other"]


class BatchCreate(BaseModel):
    client_batch_id: str = Field(min_length=8, max_length=100)
    tool_id: str = Field(min_length=1, max_length=100)
    tool_name: str = Field(min_length=1, max_length=200)
    total_count: int = Field(ge=1, le=1000)


class BatchUpdate(BaseModel):
    status: BatchStatus | None = None
    pending_count: int = Field(default=0, ge=0)
    running_count: int = Field(default=0, ge=0, le=1)
    waiting_count: int = Field(default=0, ge=0)
    completed_count: int = Field(default=0, ge=0)
    failed_count: int = Field(default=0, ge=0)


class BatchItemUpdate(BaseModel):
    account_label_masked: str = Field(min_length=1, max_length=200)
    status: ItemStatus
    intervention_type: InterventionType | None = None
    customer_message: str | None = Field(default=None, max_length=500)

    @field_validator("customer_message")
    @classmethod
    def strip_message(cls, value):
        return value.strip() if value else value


class BatchFinish(BaseModel):
    status: Literal["completed", "cancelled", "interrupted"]


class BusinessBatchItemResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    client_item_id: str
    account_label_masked: str | None = None
    status: str
    intervention_type: str | None = None
    customer_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    updated_at: str | None = None


class BusinessBatchResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    client_batch_id: str
    tool_id: str
    tool_name: str
    status: str
    total_count: int
    pending_count: int
    running_count: int
    waiting_count: int
    completed_count: int
    failed_count: int
    started_at: str | None = None
    finished_at: str | None = None
    last_heartbeat_at: str | None = None
    items: list[BusinessBatchItemResponse] | None = None


class BusinessBootstrapResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    product_type: str
    entitlements: dict[str, Any]
    seat_limit: int
    tools: list[dict[str, Any]]
