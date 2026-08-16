"""Strict request and response contracts for internal demo walkthroughs."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DemoRunStatus = Literal["created", "running", "paused", "completed", "cancelled", "error"]
DemoBatchStatus = Literal["created", "running", "completed", "cancelled", "error"]
DemoBatchItemStatus = Literal["queued", "playing", "played", "skipped", "error"]
DemoOutcome = Literal["completed_example", "attention_example", "failure_example"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DemoRunCreate(StrictModel):
    tool_id: str = Field(min_length=1, max_length=100)
    tool_name: str = Field(min_length=1, max_length=200)
    platform_key: str = Field(min_length=1, max_length=50)
    scenario_id: str = Field(min_length=1, max_length=100)
    total_step_count: int = Field(default=1, ge=1, le=100)


class DemoRunUpdate(StrictModel):
    event_seq: int = Field(ge=1)
    status: DemoRunStatus
    current_step_id: str | None = Field(default=None, max_length=100)
    completed_step_count: int | None = Field(default=None, ge=0, le=100)
    error_code: str | None = Field(default=None, max_length=100)


class DemoRunFinish(StrictModel):
    event_seq: int = Field(ge=1)
    completed_step_count: int = Field(ge=0, le=100)
    simulated_outcome: DemoOutcome = "completed_example"


class DemoEvent(StrictModel):
    event_seq: int = Field(ge=1)


class DemoRunResponse(BaseModel):
    id: str
    record_kind: Literal["demo"] = "demo"
    execution_scope: Literal["single"] = "single"
    tool_id: str
    tool_name_snapshot: str
    platform_key: str
    scenario_id: str
    status: DemoRunStatus
    event_seq: int
    current_step_id: str | None = None
    completed_step_count: int
    total_step_count: int
    simulated_outcome: DemoOutcome | None = None
    error_code: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DemoBatchCreate(StrictModel):
    tool_id: str = Field(min_length=1, max_length=100)
    tool_name: str = Field(min_length=1, max_length=200)
    platform_key: str = Field(min_length=1, max_length=50)
    scenario_id: str = Field(min_length=1, max_length=100)
    row_count: int = Field(ge=1, le=50)


class DemoBatchUpdate(StrictModel):
    event_seq: int = Field(ge=1)
    status: DemoBatchStatus
    queued_count: int | None = Field(default=None, ge=0, le=50)
    playing_count: int | None = Field(default=None, ge=0, le=50)
    played_count: int | None = Field(default=None, ge=0, le=50)
    skipped_count: int | None = Field(default=None, ge=0, le=50)
    error_count: int | None = Field(default=None, ge=0, le=50)


class DemoBatchItemUpdate(StrictModel):
    event_seq: int = Field(ge=1)
    status: DemoBatchItemStatus
    simulated_outcome: DemoOutcome | None = None


class DemoBatchItemResponse(BaseModel):
    item_ref: str
    status: DemoBatchItemStatus
    simulated_outcome: DemoOutcome | None = None
    event_seq: int
    started_at: datetime | None = None
    finished_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DemoBatchResponse(BaseModel):
    id: str
    record_kind: Literal["demo"] = "demo"
    execution_scope: Literal["batch"] = "batch"
    tool_id: str
    tool_name_snapshot: str
    platform_key: str
    scenario_id: str
    row_count: int
    status: DemoBatchStatus
    event_seq: int
    queued_count: int
    playing_count: int
    played_count: int
    skipped_count: int
    error_count: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    items: list[DemoBatchItemResponse] | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedDemoRuns(BaseModel):
    data: list[DemoRunResponse]
    page: int
    page_size: int
    total: int


class PaginatedDemoBatches(BaseModel):
    data: list[DemoBatchResponse]
    page: int
    page_size: int
    total: int
