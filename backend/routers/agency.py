"""Scoped channel-partner workspace and owner approval endpoints."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import require_agency_staff, require_super_admin
from database import get_db
from domains.commerce.agency import AgencyService
from schemas.agency import (
    AgenciesEnvelope,
    AgencyEnvelope,
    AgencyLicenseEnvelope,
    AgencyLicensesEnvelope,
    AgencyOrderCreate,
    AgencyOrderEnvelope,
    AgencyOrdersEnvelope,
    AgencyPlansEnvelope,
    AgencyRequestCreate,
    AgencyRequestEnvelope,
    AgencyRequestResolve,
    AgencyRequestsEnvelope,
    AgencySummaryEnvelope,
    AgencyUpdate,
    AgencyWrite,
    CustomerCreate,
    CustomerEnvelope,
    CustomersEnvelope,
    CustomerUpdate,
)

router = APIRouter()
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]
AgencyId = Annotated[int | None, Query(gt=0)]
Search = Annotated[str | None, Query(max_length=100)]


def workspace(db: AsyncSession = Depends(get_db), actor: dict[str, Any] = Depends(require_agency_staff)) -> AgencyService:
    return AgencyService(db, actor)


def owner_workspace(db: AsyncSession = Depends(get_db), actor: dict[str, Any] = Depends(require_super_admin)) -> AgencyService:
    return AgencyService(db, actor)


Service = Annotated[AgencyService, Depends(workspace)]
OwnerService = Annotated[AgencyService, Depends(owner_workspace)]


def envelope(data: Any) -> dict[str, Any]:
    return {"success": True, "message": "ok", "data": data}


@router.get("/summary", response_model=AgencySummaryEnvelope)
async def summary(service: Service, agency_id: AgencyId = None) -> dict[str, Any]:
    return envelope(await service.summary(agency_id))


@router.get("/agencies", response_model=AgenciesEnvelope)
async def agencies(service: OwnerService, page: Page = 1, page_size: PageSize = 20, q: Search = None, status: Literal["active", "disabled"] | None = None) -> dict[str, Any]:
    return await service.list_agencies(page, page_size, q, status)


@router.post("/agencies", response_model=AgencyEnvelope, status_code=201)
async def create_agency(data: AgencyWrite, request: Request, service: OwnerService) -> dict[str, Any]:
    return envelope(await service.create_agency(data, request))


@router.patch("/agencies/{item_id}", response_model=AgencyEnvelope)
async def update_agency(item_id: int, data: AgencyUpdate, request: Request, service: OwnerService) -> dict[str, Any]:
    return envelope(await service.update_agency(item_id, data, request))


@router.get("/plans", response_model=AgencyPlansEnvelope)
async def plans(service: Service) -> dict[str, Any]:
    return envelope(await service.plans())


@router.get("/customers", response_model=CustomersEnvelope)
async def customers(service: Service, page: Page = 1, page_size: PageSize = 20, q: Search = None, agency_id: AgencyId = None) -> dict[str, Any]:
    return await service.customers(page, page_size, q, agency_id)


@router.post("/customers", response_model=CustomerEnvelope, status_code=201)
async def create_customer(data: CustomerCreate, request: Request, service: Service) -> dict[str, Any]:
    return envelope(await service.create_customer(data, request))


@router.get("/customers/{item_id}", response_model=CustomerEnvelope)
async def customer(item_id: int, service: Service) -> dict[str, Any]:
    return envelope(await service.customer(item_id))


@router.patch("/customers/{item_id}", response_model=CustomerEnvelope)
async def update_customer(item_id: int, data: CustomerUpdate, request: Request, service: Service) -> dict[str, Any]:
    return envelope(await service.update_customer(item_id, data, request))


@router.get("/orders", response_model=AgencyOrdersEnvelope)
async def orders(service: Service, page: Page = 1, page_size: PageSize = 20, agency_id: AgencyId = None, status: Literal["pending", "paid", "delivered", "refunded", "cancelled"] | None = None, q: Search = None, customer_id: AgencyId = None) -> dict[str, Any]:
    return await service.orders(page, page_size, agency_id, status, q, customer_id)


@router.get("/orders/export", response_class=StreamingResponse, response_model=None, responses={200: {"content": {"text/csv": {}}}})
async def export_orders(service: Service, agency_id: AgencyId = None, status: Literal["pending", "paid", "delivered", "refunded", "cancelled"] | None = None, q: Search = None, customer_id: AgencyId = None) -> StreamingResponse:
    return StreamingResponse(service.export_orders(agency_id, status, q, customer_id), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="agency-orders.csv"'})


@router.post("/orders", response_model=AgencyOrderEnvelope, status_code=201)
async def create_order(data: AgencyOrderCreate, request: Request, service: Service) -> dict[str, Any]:
    return envelope(await service.create_order(data, request))


@router.get("/orders/{item_id}", response_model=AgencyOrderEnvelope)
async def order(item_id: int, service: Service) -> dict[str, Any]:
    return envelope(await service.order(item_id))


@router.post("/orders/{item_id}/mark-paid", response_model=AgencyOrderEnvelope)
async def mark_paid(item_id: int, request: Request, service: OwnerService) -> dict[str, Any]:
    return envelope(await service.mark_paid(item_id, request))


@router.post("/orders/{item_id}/deliver", response_model=AgencyOrderEnvelope)
async def deliver(item_id: int, request: Request, service: OwnerService) -> dict[str, Any]:
    return envelope(await service.deliver(item_id, request))


@router.get("/licenses", response_model=AgencyLicensesEnvelope)
async def licenses(service: Service, page: Page = 1, page_size: PageSize = 20, agency_id: AgencyId = None, status: Search = None, q: Search = None) -> dict[str, Any]:
    return await service.licenses(page, page_size, agency_id, status, q)


@router.get("/licenses/{item_id}", response_model=AgencyLicenseEnvelope)
async def license(item_id: int, service: Service) -> dict[str, Any]:
    return envelope(await service.license(item_id))


@router.get("/requests", response_model=AgencyRequestsEnvelope)
async def requests(service: Service, page: Page = 1, page_size: PageSize = 20, agency_id: AgencyId = None, status: Literal["open", "resolved", "rejected"] | None = None, q: Search = None) -> dict[str, Any]:
    return await service.requests(page, page_size, agency_id, status, q)


@router.post("/requests", response_model=AgencyRequestEnvelope, status_code=201)
async def create_request(data: AgencyRequestCreate, request: Request, service: Service) -> dict[str, Any]:
    return envelope(await service.create_request(data, request))


@router.get("/requests/{item_id}", response_model=AgencyRequestEnvelope)
async def support_request(item_id: int, service: Service) -> dict[str, Any]:
    return envelope(await service.support_request(item_id))


@router.patch("/requests/{item_id}", response_model=AgencyRequestEnvelope)
async def resolve_request(item_id: int, data: AgencyRequestResolve, request: Request, service: OwnerService) -> dict[str, Any]:
    return envelope(await service.resolve_request(item_id, data, request))
