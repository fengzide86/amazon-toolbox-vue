"""B 端批量工作台控制面。仅接收脱敏状态，不接收 Excel 原文。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.response import APIResponse, success_response
from database import get_db
from domains.access import require_business_access
from domains.automation import business_service
from schemas.business import (
    BatchCreate,
    BatchFinish,
    BatchItemUpdate,
    BatchUpdate,
    BusinessBatchItemResponse,
    BusinessBatchResponse,
    BusinessBootstrapResponse,
)

router = APIRouter()


@router.get(
    "/bootstrap",
    response_model=APIResponse[BusinessBootstrapResponse],
    response_model_exclude_unset=True,
)
async def bootstrap(
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return success_response(await business_service.bootstrap(db, context))


@router.get(
    "/tools",
    response_model=APIResponse[list[dict[str, Any]]],
    response_model_exclude_unset=True,
)
async def get_tools(
    _context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return success_response(await business_service.business_tools(db))


@router.post(
    "/batches",
    response_model=APIResponse[BusinessBatchResponse],
    response_model_exclude_unset=True,
)
async def create_batch(
    req: BatchCreate,
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data, created = await business_service.create_batch(db, req, context)
    return success_response(data, message="批次已创建" if created else "ok")


@router.get(
    "/batches",
    response_model=APIResponse[list[BusinessBatchResponse]],
    response_model_exclude_unset=True,
)
async def list_batches(
    limit: int = Query(30, ge=1, le=100),
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return success_response(await business_service.list_batches(db, context, limit=limit))


@router.get(
    "/batches/{batch_id}",
    response_model=APIResponse[BusinessBatchResponse],
    response_model_exclude_unset=True,
)
async def get_batch(
    batch_id: int,
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return success_response(await business_service.get_batch(db, batch_id, context))


@router.patch(
    "/batches/{batch_id}",
    response_model=APIResponse[BusinessBatchResponse],
    response_model_exclude_unset=True,
)
async def update_batch(
    req: BatchUpdate,
    batch_id: int,
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return success_response(await business_service.update_batch(db, batch_id, req, context))


@router.put(
    "/batches/{batch_id}/items/{client_item_id}",
    response_model=APIResponse[BusinessBatchItemResponse],
    response_model_exclude_unset=True,
)
async def upsert_batch_item(
    req: BatchItemUpdate,
    batch_id: int,
    client_item_id: str,
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await business_service.upsert_batch_item(db, batch_id, client_item_id, req, context)
    return success_response(data)


@router.post(
    "/batches/{batch_id}/finish",
    response_model=APIResponse[BusinessBatchResponse],
    response_model_exclude_unset=True,
)
async def finish_batch(
    req: BatchFinish,
    batch_id: int,
    context: dict[str, Any] = Depends(require_business_access),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await business_service.finish_batch(db, batch_id, req, context)
    return success_response(data, message="批次已结束")
