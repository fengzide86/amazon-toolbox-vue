"""Internal-only demo walkthrough API.

This router never calls the Runner, never grants a launch token, and never
writes to ``run_logs`` or the real B-side automation tables.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from domains.automation import demo_service
from schemas.demo import (
    DemoBatchCreate,
    DemoBatchItemResponse,
    DemoBatchItemUpdate,
    DemoBatchResponse,
    DemoBatchUpdate,
    DemoEvent,
    DemoRunCreate,
    DemoRunFinish,
    DemoRunResponse,
    DemoRunUpdate,
    PaginatedDemoBatches,
    PaginatedDemoRuns,
)

router = APIRouter()


@router.post("/runs", response_model=DemoRunResponse, status_code=status.HTTP_201_CREATED)
async def create_demo_run(
    req: DemoRunCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoRunResponse:
    return await demo_service.create_demo_run(
        db,
        req,
        current_user,
        idempotency_key=idempotency_key,
    )


@router.get("/runs", response_model=PaginatedDemoRuns)
async def list_demo_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    platform_key: str | None = Query(default=None, max_length=50),
    tool_id: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> PaginatedDemoRuns:
    return await demo_service.list_demo_runs(
        db,
        current_user,
        page=page,
        page_size=page_size,
        platform_key=platform_key,
        tool_id=tool_id,
    )


@router.get("/runs/{run_id}", response_model=DemoRunResponse)
async def get_demo_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoRunResponse:
    return await demo_service.get_demo_run(db, run_id, current_user)


@router.patch("/runs/{run_id}", response_model=DemoRunResponse)
async def update_demo_run(
    run_id: str,
    req: DemoRunUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoRunResponse:
    return await demo_service.update_demo_run(db, run_id, req, current_user)


@router.post("/runs/{run_id}/finish", response_model=DemoRunResponse)
async def finish_demo_run(
    run_id: str,
    req: DemoRunFinish,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoRunResponse:
    return await demo_service.finish_demo_run(db, run_id, req, current_user)


@router.post("/runs/{run_id}/cancel", response_model=DemoRunResponse)
async def cancel_demo_run(
    run_id: str,
    req: DemoEvent,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoRunResponse:
    return await demo_service.cancel_demo_run(db, run_id, req, current_user)


@router.post("/batches", response_model=DemoBatchResponse, status_code=status.HTTP_201_CREATED)
async def create_demo_batch(
    req: DemoBatchCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoBatchResponse:
    return await demo_service.create_demo_batch(
        db,
        req,
        current_user,
        idempotency_key=idempotency_key,
    )


@router.get("/batches", response_model=PaginatedDemoBatches)
async def list_demo_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> PaginatedDemoBatches:
    return await demo_service.list_demo_batches(
        db,
        current_user,
        page=page,
        page_size=page_size,
    )


@router.get("/batches/{batch_id}", response_model=DemoBatchResponse)
async def get_demo_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoBatchResponse:
    return await demo_service.get_demo_batch(db, batch_id, current_user)


@router.patch("/batches/{batch_id}", response_model=DemoBatchResponse)
async def update_demo_batch(
    batch_id: str,
    req: DemoBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoBatchResponse:
    return await demo_service.update_demo_batch(db, batch_id, req, current_user)


@router.put("/batches/{batch_id}/items/{item_ref}", response_model=DemoBatchItemResponse)
async def update_demo_batch_item(
    batch_id: str,
    item_ref: str,
    req: DemoBatchItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoBatchItemResponse:
    return await demo_service.update_demo_batch_item(db, batch_id, item_ref, req, current_user)


@router.post("/batches/{batch_id}/finish", response_model=DemoBatchResponse)
async def finish_demo_batch(
    batch_id: str,
    req: DemoEvent,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> DemoBatchResponse:
    return await demo_service.finish_demo_batch(db, batch_id, req, current_user)
