"""Expense-category and company-expense ledger operations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import ConflictException, NotFoundException, ValidationException
from models import (
    ExpenseAttachment,
    ExpenseCategory,
    ExpenseCategoryStatus,
    ExpenseOccurrenceStatus,
    ExpenseRecord,
    ExpenseRecordStatus,
    ExpenseRenewal,
    ExpenseRenewalOccurrence,
    StaffUser,
)
from schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseRecordCreate,
    ExpenseRecordUpdate,
)

from .expense_attachments import serialize_attachment
from .expense_common import ExpenseServiceBase, actor_id, money, month_start, shift_month

DEFAULT_CATEGORIES = (
    ("development", "开发", 10),
    ("marketing", "市场", 20),
    ("tool_membership", "工具会员", 30),
    ("server_cloud", "服务器/云服务", 40),
    ("operations", "日常运营", 50),
    ("tax_fees", "税费", 60),
    ("other", "其他", 70),
)


def build_expense_row_query() -> Any:
    """Build the shared ledger detail/export projection."""
    return (
        select(
            ExpenseRecord,
            ExpenseCategory.name,
            StaffUser.display_name,
            ExpenseRenewal.name,
        )
        .join(ExpenseCategory, ExpenseRecord.category_id == ExpenseCategory.id)
        .outerjoin(StaffUser, ExpenseRecord.created_by_staff_id == StaffUser.id)
        .outerjoin(ExpenseRenewal, ExpenseRecord.renewal_id == ExpenseRenewal.id)
    )


def serialize_expense(
    row: Any,
    attachments: list[ExpenseAttachment] | None = None,
) -> dict[str, Any]:
    record, category_name, creator_name, renewal_name = row
    return {
        "id": record.id,
        "amount": money(record.amount),
        "currency": "CNY",
        "expense_date": record.expense_date,
        "title": record.title,
        "category_id": record.category_id,
        "category_name": category_name,
        "payee": record.payee,
        "note": record.note,
        "status": record.status,
        "renewal_id": record.renewal_id,
        "renewal_name": renewal_name,
        "renewal_due_on": record.renewal_due_on,
        "created_by_staff_id": record.created_by_staff_id,
        "created_by_name": creator_name,
        "updated_by_staff_id": record.updated_by_staff_id,
        "voided_by_staff_id": record.voided_by_staff_id,
        "voided_at": record.voided_at,
        "void_reason": record.void_reason,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "attachments": [serialize_attachment(item) for item in attachments or []],
    }


async def fetch_expense(db: AsyncSession, expense_id: int) -> dict[str, Any]:
    """Fetch one complete expense view for ledger and renewal workflows."""
    row = (
        await db.execute(build_expense_row_query().where(ExpenseRecord.id == expense_id))
    ).one_or_none()
    if row is None:
        raise NotFoundException("支出记录不存在")
    attachments = (
        await db.execute(
            select(ExpenseAttachment)
            .where(ExpenseAttachment.expense_id == expense_id)
            .order_by(ExpenseAttachment.created_at, ExpenseAttachment.id)
        )
    ).scalars().all()
    return serialize_expense(row, list(attachments))


class ExpenseLedgerService(ExpenseServiceBase):
    """Manage categories and immutable-history expense ledger entries."""

    async def ensure_default_categories(self) -> None:
        count = int(
            (await self.db.execute(select(func.count(ExpenseCategory.id)))).scalar() or 0
        )
        if count:
            return
        for code, name, order in DEFAULT_CATEGORIES:
            self.db.add(
                ExpenseCategory(
                    code=code,
                    name=name,
                    sort_order=order,
                    is_system=True,
                    status=ExpenseCategoryStatus.ACTIVE,
                )
            )
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()

    async def list_categories(self, include_archived: bool = True) -> list[dict[str, Any]]:
        await self.ensure_default_categories()
        query = select(ExpenseCategory)
        if not include_archived:
            query = query.where(ExpenseCategory.status == ExpenseCategoryStatus.ACTIVE)
        result = await self.db.execute(
            query.order_by(ExpenseCategory.sort_order, ExpenseCategory.id)
        )
        return [self.serialize_category(category) for category in result.scalars().all()]

    async def create_category(
        self,
        payload: ExpenseCategoryCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self.ensure_default_categories()
        duplicate = await self.db.execute(
            select(ExpenseCategory.id).where(
                func.lower(ExpenseCategory.name) == payload.name.casefold()
            )
        )
        if duplicate.scalar_one_or_none() is not None:
            raise ConflictException("支出分类名称已存在")
        category = ExpenseCategory(
            code=f"custom_{uuid.uuid4().hex[:16]}",
            name=payload.name,
            sort_order=payload.sort_order,
            status=ExpenseCategoryStatus.ACTIVE,
            is_system=False,
            created_by_staff_id=actor_id(actor),
        )
        self.db.add(category)
        await self.db.flush()
        await self._audit(
            "expense_category_create",
            "expense_category",
            category.id,
            actor,
            request,
            {"name": category.name},
        )
        await self.db.commit()
        return self.serialize_category(category)

    async def update_category(
        self,
        category_id: int,
        payload: ExpenseCategoryUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        category = await self._category(category_id)
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if "name" in changes:
            duplicate = await self.db.execute(
                select(ExpenseCategory.id).where(
                    func.lower(ExpenseCategory.name) == str(changes["name"]).casefold(),
                    ExpenseCategory.id != category.id,
                )
            )
            if duplicate.scalar_one_or_none() is not None:
                raise ConflictException("支出分类名称已存在")
        before = self.serialize_category(category)
        for field, value in changes.items():
            setattr(category, field, value)
        await self._audit(
            "expense_category_update",
            "expense_category",
            category.id,
            actor,
            request,
            {"before": before, "after": changes},
        )
        await self.db.commit()
        await self.db.refresh(category)
        return self.serialize_category(category)

    async def list_expenses(
        self,
        page: int,
        page_size: int,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> dict[str, Any]:
        filters = self._expense_filters(month, category_id, status, keyword)
        count = int(
            (
                await self.db.execute(
                    select(func.count(ExpenseRecord.id)).where(*filters)
                )
            ).scalar()
            or 0
        )
        query = (
            self._expense_row_query()
            .where(*filters)
            .order_by(ExpenseRecord.expense_date.desc(), ExpenseRecord.id.desc())
        )
        rows = (
            await self.db.execute(query.offset((page - 1) * page_size).limit(page_size))
        ).all()
        return {
            "success": True,
            "message": "ok",
            "data": [self.serialize_expense_row(row) for row in rows],
            "total": count,
            "page": page,
            "page_size": page_size,
            "total_pages": (count + page_size - 1) // page_size,
        }

    def expense_export_query(
        self,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> Any:
        return (
            self._expense_row_query()
            .where(*self._expense_filters(month, category_id, status, keyword))
            .order_by(ExpenseRecord.expense_date.desc(), ExpenseRecord.id.desc())
        )

    async def get_expense(self, expense_id: int) -> dict[str, Any]:
        return await fetch_expense(self.db, expense_id)

    async def create_expense(
        self,
        payload: ExpenseRecordCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self._active_category(payload.category_id)
        record = ExpenseRecord(
            amount=money(payload.amount),
            currency="CNY",
            expense_date=payload.expense_date,
            title=payload.title,
            category_id=payload.category_id,
            payee=payload.payee,
            note=payload.note,
            status=ExpenseRecordStatus.ACTIVE,
            created_by_staff_id=actor_id(actor),
            updated_by_staff_id=actor_id(actor),
        )
        self.db.add(record)
        await self.db.flush()
        await self._audit(
            "expense_create",
            "expense",
            record.id,
            actor,
            request,
            {"amount": str(record.amount), "title": record.title},
        )
        await self.db.commit()
        return await self.get_expense(record.id)

    async def update_expense(
        self,
        expense_id: int,
        payload: ExpenseRecordUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        record = await self._expense(expense_id, lock=True)
        if record.status != ExpenseRecordStatus.ACTIVE:
            raise ConflictException("已作废的支出不能修改")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if changes.get("category_id") is not None:
            await self._active_category(int(changes["category_id"]))
        before = {field: str(getattr(record, field)) for field in changes}
        for field, value in changes.items():
            setattr(record, field, money(value) if field == "amount" else value)
        record.updated_by_staff_id = actor_id(actor)
        await self._audit(
            "expense_update",
            "expense",
            record.id,
            actor,
            request,
            {
                "before": before,
                "after": {key: str(value) for key, value in changes.items()},
            },
        )
        await self.db.commit()
        return await self.get_expense(record.id)

    async def void_expense(
        self,
        expense_id: int,
        reason: str,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        record = await self._expense(expense_id, lock=True)
        if record.status == ExpenseRecordStatus.VOIDED:
            raise ConflictException("该支出已经作废")
        record.status = ExpenseRecordStatus.VOIDED
        record.void_reason = reason
        record.voided_at = datetime.utcnow()
        record.voided_by_staff_id = actor_id(actor)
        record.updated_by_staff_id = actor_id(actor)
        if record.renewal_id is not None and record.renewal_due_on is not None:
            occurrence = (
                await self.db.execute(
                    select(ExpenseRenewalOccurrence)
                    .where(ExpenseRenewalOccurrence.expense_id == record.id)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if occurrence is not None:
                occurrence.status = ExpenseOccurrenceStatus.REVERSED
                occurrence.processed_by_staff_id = actor_id(actor)
                occurrence.processed_at = datetime.utcnow()
        await self._audit(
            "expense_void",
            "expense",
            record.id,
            actor,
            request,
            {"reason": reason},
        )
        await self.db.commit()
        return await self.get_expense(record.id)

    def _expense_filters(
        self,
        month: str | None,
        category_id: int | None,
        status: str | None,
        keyword: str | None,
    ) -> list[Any]:
        filters: list[Any] = []
        if month:
            start = month_start(month)
            filters.extend(
                [
                    ExpenseRecord.expense_date >= start,
                    ExpenseRecord.expense_date < shift_month(start, 1),
                ]
            )
        if category_id:
            filters.append(ExpenseRecord.category_id == category_id)
        if status:
            if status not in ExpenseRecordStatus.ALL:
                raise ValidationException("支出状态无效")
            filters.append(ExpenseRecord.status == status)
        if keyword and keyword.strip():
            value = f"%{keyword.strip()}%"
            filters.append(
                or_(
                    ExpenseRecord.title.ilike(value),
                    ExpenseRecord.payee.ilike(value),
                    ExpenseRecord.note.ilike(value),
                )
            )
        return filters

    @staticmethod
    def _expense_row_query() -> Any:
        return build_expense_row_query()

    def serialize_expense_row(
        self,
        row: Any,
        attachments: list[ExpenseAttachment] | None = None,
    ) -> dict[str, Any]:
        return serialize_expense(row, attachments)

    @staticmethod
    def serialize_category(category: ExpenseCategory) -> dict[str, Any]:
        return {
            "id": category.id,
            "code": category.code,
            "name": category.name,
            "status": category.status,
            "sort_order": category.sort_order,
            "is_system": bool(category.is_system),
            "created_at": category.created_at,
            "updated_at": category.updated_at,
        }


__all__ = [
    "DEFAULT_CATEGORIES",
    "ExpenseLedgerService",
    "build_expense_row_query",
    "fetch_expense",
    "serialize_expense",
]
