"""Public plan catalogue and staff-only plan lifecycle routes."""

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import require_any_staff, require_commerce_operator, require_super_admin
from core.response import CompatibleResponse
from database import get_db
from schemas.plan import PlanCreate, PlanUpdate
from services.plan_service import PlanService

router = APIRouter()


@router.get("", response_model=CompatibleResponse)
async def get_plans(db: AsyncSession = Depends(get_db)):
    """Public catalogue: only enabled consumer plans are exposed."""
    return await PlanService(db).list_public(product_type="consumer")


@router.get("/admin", response_model=CompatibleResponse)
async def get_plans_admin(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _staff: dict = Depends(require_any_staff),
):
    return await PlanService(db).list_admin(status_filter, page, page_size)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CompatibleResponse)
async def create_plan(
    req: PlanCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    return await PlanService(db).create(req.model_dump(), actor, request)


@router.get("/{plan_id}", response_model=CompatibleResponse)
async def get_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    return await PlanService(db).get_public(plan_id)


@router.patch("/{plan_id}", response_model=CompatibleResponse)
@router.put("/{plan_id}", deprecated=True, response_model=CompatibleResponse)
async def update_plan(
    plan_id: int,
    req: PlanUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    return await PlanService(db).update(
        plan_id,
        req.model_dump(exclude_unset=True),
        actor,
        request,
    )


@router.post("/{plan_id}/enable", response_model=CompatibleResponse)
async def enable_plan(
    plan_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    return await PlanService(db).transition(plan_id, "enable", actor, request)


@router.post("/{plan_id}/disable", response_model=CompatibleResponse)
async def disable_plan(
    plan_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    return await PlanService(db).transition(plan_id, "disable", actor, request)


@router.post("/{plan_id}/archive", response_model=CompatibleResponse)
async def archive_plan(
    plan_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    return await PlanService(db).transition(plan_id, "archive", actor, request)


@router.delete("/{plan_id}", deprecated=True, response_model=CompatibleResponse)
async def archive_plan_compatibility(
    plan_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(require_super_admin),
):
    """Compatibility alias; there is no physical plan deletion."""
    return await PlanService(db).transition(plan_id, "archive", actor, request)


@router.get("/{plan_id}/stats", response_model=CompatibleResponse)
async def get_plan_stats(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    _staff: dict = Depends(require_commerce_operator),
):
    return await PlanService(db).stats(plan_id)
