from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from core.response import APIResponse


class RunnerExecutionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=255)
    run_id: str = Field(min_length=1, max_length=120)
    status: Literal["succeeded", "failed"]
    error_code: str | None = Field(default=None, max_length=100)
    adapter_version: str | None = Field(default=None, max_length=50)
    page_fingerprint: str | None = Field(default=None, min_length=64, max_length=64)
    page_changed: bool = False
    completed_steps: int = Field(default=0, ge=0, le=500)


class ExecutionReportResult(BaseModel):
    accepted: bool
    duplicate: bool
    execution_id: int | None = None


class ExecutionReportResponse(APIResponse[ExecutionReportResult]):
    pass


class ExecutionResponse(BaseModel):
    id: int
    record_kind: Literal["live"] = "live"
    status: str
    verification: str
    tool_id: str | None = None
    tool_name: str | None = None
    created_at: str | None = None
    detail: str | None = None
    error_code: str | None = None


class ExecutionPageResponse(BaseModel):
    data: list[ExecutionResponse]
    page: int
    page_size: int
    total: int
