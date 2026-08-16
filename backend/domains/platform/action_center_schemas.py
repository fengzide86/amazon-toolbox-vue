"""管理端行动中心的只读响应契约。"""

from pydantic import BaseModel

from schemas.expense import ExpenseRenewalResponse


class ActionCenterSummary(BaseModel):
    expiring_authorizations: int
    device_anomalies: int
    pending_tickets: int
    waiting_interventions: int
    stale_batches: int
    expense_renewals_due: int


class ExpiringAuthorizationItem(BaseModel):
    id: int
    code_masked: str
    expires_at: str | None = None


class DeviceAnomalyItem(BaseModel):
    auth_code_id: int
    code_masked: str
    seat_used: int
    seat_limit: int
    device_used: int
    device_limit: int


class PendingTicketItem(BaseModel):
    id: int
    title: str
    priority: str | None = None
    created_at: str | None = None


class ActionCenterData(BaseModel):
    summary: ActionCenterSummary
    expiring_authorizations: list[ExpiringAuthorizationItem]
    device_anomalies: list[DeviceAnomalyItem]
    pending_tickets: list[PendingTicketItem]
    waiting_interventions: list[object]
    stale_batches: list[object]
    expense_renewals: list[ExpenseRenewalResponse]


class ActionCenterResponse(BaseModel):
    success: bool
    message: str
    data: ActionCenterData


class FeatureDisabledDetail(BaseModel):
    code: str
    message: str


class FeatureDisabledResponse(BaseModel):
    detail: FeatureDisabledDetail
