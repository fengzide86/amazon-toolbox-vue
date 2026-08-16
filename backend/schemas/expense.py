"""Typed contracts for the internal company expense ledger."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CategoryStatusValue = Literal["active", "archived"]
ExpenseStatusValue = Literal["active", "voided"]
RenewalStatusValue = Literal["active", "paused", "ended"]
RenewalCycleValue = Literal["monthly", "quarterly", "semiannual", "annual"]
OccurrenceStatusValue = Literal["paid", "skipped", "reversed"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExpenseCategoryCreate(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    sort_order: int = Field(default=100, ge=0, le=10000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("分类名称不能为空")
        return stripped


class ExpenseCategoryUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_order: int | None = Field(default=None, ge=0, le=10000)
    status: CategoryStatusValue | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("分类名称不能为空")
        return stripped


class ExpenseCategoryResponse(BaseModel):
    id: int
    code: str
    name: str
    status: CategoryStatusValue
    sort_order: int
    is_system: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ExpenseAttachmentResponse(BaseModel):
    id: int
    expense_id: int
    original_name: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: datetime | None = None


class ExpenseRecordCreate(StrictModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    expense_date: date
    title: str = Field(min_length=1, max_length=200)
    category_id: int = Field(gt=0)
    payee: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("支出事项不能为空")
        return stripped

    @field_validator("payee", "note")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseRecordUpdate(StrictModel):
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    expense_date: date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category_id: int | None = Field(default=None, gt=0)
    payee: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("支出事项不能为空")
        return stripped

    @field_validator("payee", "note")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseVoidRequest(StrictModel):
    reason: str = Field(min_length=2, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return value.strip()


class ExpenseRecordResponse(BaseModel):
    id: int
    amount: Decimal
    currency: Literal["CNY"] = "CNY"
    expense_date: date
    title: str
    category_id: int
    category_name: str
    payee: str | None = None
    note: str | None = None
    status: ExpenseStatusValue
    renewal_id: int | None = None
    renewal_name: str | None = None
    renewal_due_on: date | None = None
    created_by_staff_id: int | None = None
    created_by_name: str | None = None
    updated_by_staff_id: int | None = None
    voided_by_staff_id: int | None = None
    voided_at: datetime | None = None
    void_reason: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    attachments: list[ExpenseAttachmentResponse] = Field(default_factory=list)


class ExpenseTrendPoint(BaseModel):
    month: str
    total: Decimal


class ExpenseCategoryTotal(BaseModel):
    category_id: int
    category_name: str
    total: Decimal
    percentage: Decimal


class ExpenseSummaryResponse(BaseModel):
    month: str
    total: Decimal
    previous_total: Decimal
    change_percent: Decimal
    count: int
    upcoming_renewals: int
    overdue_renewals: int
    trend: list[ExpenseTrendPoint]
    categories: list[ExpenseCategoryTotal]


class ExpenseRenewalCreate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    vendor: str | None = Field(default=None, max_length=200)
    default_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    category_id: int = Field(gt=0)
    cycle: RenewalCycleValue
    next_due_on: date
    reminder_days: int = Field(default=7, ge=0, le=90)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("续费项目名称不能为空")
        return stripped

    @field_validator("vendor", "note")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseRenewalUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    vendor: str | None = Field(default=None, max_length=200)
    default_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    category_id: int | None = Field(default=None, gt=0)
    cycle: RenewalCycleValue | None = None
    next_due_on: date | None = None
    reminder_days: int | None = Field(default=None, ge=0, le=90)
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("续费项目名称不能为空")
        return stripped

    @field_validator("vendor", "note")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseRenewalResumeRequest(StrictModel):
    next_due_on: date


class ExpenseRenewalConfirmRequest(StrictModel):
    due_on: date
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    expense_date: date | None = None
    note: str | None = Field(default=None, max_length=4000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ExpenseRenewalSkipRequest(StrictModel):
    due_on: date
    note: str | None = Field(default=None, max_length=4000)


class ExpenseRenewalOccurrenceResponse(BaseModel):
    id: int
    renewal_id: int
    due_on: date
    status: OccurrenceStatusValue
    expense_id: int | None = None
    note: str | None = None
    processed_by_staff_id: int | None = None
    processed_at: datetime | None = None


class ExpenseRenewalResponse(BaseModel):
    id: int
    name: str
    vendor: str | None = None
    default_amount: Decimal
    category_id: int
    category_name: str
    cycle: RenewalCycleValue
    next_due_on: date
    reminder_days: int
    status: RenewalStatusValue
    due_state: Literal["upcoming", "due", "overdue", "scheduled", "paused", "ended"]
    note: str | None = None
    created_by_staff_id: int | None = None
    updated_by_staff_id: int | None = None
    paused_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    occurrences: list[ExpenseRenewalOccurrenceResponse] = Field(default_factory=list)


class ExpenseRenewalConfirmResponse(BaseModel):
    renewal: ExpenseRenewalResponse
    expense: ExpenseRecordResponse
