from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


BatchStatus = Literal["running", "completed", "cancelled", "interrupted"]
ItemStatus = Literal["pending", "running", "waiting_user", "completed", "failed", "cancelled"]
InterventionType = Literal["login", "captcha", "two_factor", "page_confirmation", "other"]


class BatchCreate(BaseModel):
    client_batch_id: str = Field(min_length=8, max_length=100)
    tool_id: str = Field(min_length=1, max_length=100)
    tool_name: str = Field(min_length=1, max_length=200)
    total_count: int = Field(ge=1, le=1000)


class BatchUpdate(BaseModel):
    status: Optional[BatchStatus] = None
    pending_count: int = Field(default=0, ge=0)
    running_count: int = Field(default=0, ge=0, le=1)
    waiting_count: int = Field(default=0, ge=0)
    completed_count: int = Field(default=0, ge=0)
    failed_count: int = Field(default=0, ge=0)


class BatchItemUpdate(BaseModel):
    account_label_masked: str = Field(min_length=1, max_length=200)
    status: ItemStatus
    intervention_type: Optional[InterventionType] = None
    customer_message: Optional[str] = Field(default=None, max_length=500)

    @field_validator("customer_message")
    @classmethod
    def strip_message(cls, value):
        return value.strip() if value else value


class BatchFinish(BaseModel):
    status: Literal["completed", "cancelled", "interrupted"]
