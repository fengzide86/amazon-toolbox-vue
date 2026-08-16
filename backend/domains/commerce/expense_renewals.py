"""Recurring expense schedule and occurrence processing."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from core.exceptions import ConflictException, NotFoundException, ValidationException
from models import (
    ExpenseCategory,
    ExpenseOccurrenceStatus,
    ExpenseRecord,
    ExpenseRecordStatus,
    ExpenseRenewal,
    ExpenseRenewalCycle,
    ExpenseRenewalOccurrence,
    ExpenseRenewalStatus,
)
from schemas.expense import (
    ExpenseRenewalConfirmRequest,
    ExpenseRenewalCreate,
    ExpenseRenewalSkipRequest,
    ExpenseRenewalUpdate,
)

from .expense_common import ExpenseServiceBase, actor_id, money, shift_month
from .expense_ledger import fetch_expense

CYCLE_MONTHS = {
    ExpenseRenewalCycle.MONTHLY: 1,
    ExpenseRenewalCycle.QUARTERLY: 3,
    ExpenseRenewalCycle.SEMIANNUAL: 6,
    ExpenseRenewalCycle.ANNUAL: 12,
}


def is_month_end(value: date) -> bool:
    return value.day == calendar.monthrange(value.year, value.month)[1]


def advance_due(renewal: ExpenseRenewal) -> date:
    """Advance a renewal while preserving its original month-end anchor."""
    months = CYCLE_MONTHS[renewal.cycle]
    first = shift_month(renewal.next_due_on.replace(day=1), months)
    last_day = calendar.monthrange(first.year, first.month)[1]
    day = last_day if renewal.anchor_month_end else min(renewal.anchor_day, last_day)
    return first.replace(day=day)


def serialize_occurrence(occurrence: ExpenseRenewalOccurrence) -> dict[str, Any]:
    return {
        "id": occurrence.id,
        "renewal_id": occurrence.renewal_id,
        "due_on": occurrence.due_on,
        "status": occurrence.status,
        "expense_id": occurrence.expense_id,
        "note": occurrence.note,
        "processed_by_staff_id": occurrence.processed_by_staff_id,
        "processed_at": occurrence.processed_at,
    }


class ExpenseRenewalService(ExpenseServiceBase):
    """Manage renewal schedules and atomically materialize ledger entries."""

    async def list_renewals(
        self,
        page: int,
        page_size: int,
        status: str | None,
        due_state: str | None,
        keyword: str | None,
    ) -> dict[str, Any]:
        filters = self._renewal_filters(status, due_state, keyword)
        total = int(
            (
                await self.db.execute(
                    select(func.count(ExpenseRenewal.id)).where(*filters)
                )
            ).scalar()
            or 0
        )
        rows = (
            await self.db.execute(
                self._renewal_row_query()
                .where(*filters)
                .order_by(ExpenseRenewal.next_due_on, ExpenseRenewal.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        return {
            "success": True,
            "message": "ok",
            "data": [self._serialize_renewal_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
        }

    async def get_renewal(self, renewal_id: int) -> dict[str, Any]:
        row = (
            await self.db.execute(
                self._renewal_row_query().where(ExpenseRenewal.id == renewal_id)
            )
        ).one_or_none()
        if row is None:
            raise NotFoundException("续费项目不存在")
        occurrences = (
            await self.db.execute(
                select(ExpenseRenewalOccurrence)
                .where(ExpenseRenewalOccurrence.renewal_id == renewal_id)
                .order_by(
                    ExpenseRenewalOccurrence.due_on.desc(),
                    ExpenseRenewalOccurrence.id.desc(),
                )
                .limit(24)
            )
        ).scalars().all()
        return self._serialize_renewal_row(row, list(occurrences))

    async def create_renewal(
        self,
        payload: ExpenseRenewalCreate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        await self._active_category(payload.category_id)
        renewal = ExpenseRenewal(
            name=payload.name,
            vendor=payload.vendor,
            default_amount=money(payload.default_amount),
            category_id=payload.category_id,
            cycle=payload.cycle,
            next_due_on=payload.next_due_on,
            reminder_days=payload.reminder_days,
            anchor_day=payload.next_due_on.day,
            anchor_month_end=is_month_end(payload.next_due_on),
            status=ExpenseRenewalStatus.ACTIVE,
            note=payload.note,
            created_by_staff_id=actor_id(actor),
            updated_by_staff_id=actor_id(actor),
        )
        self.db.add(renewal)
        await self.db.flush()
        await self._audit(
            "expense_renewal_create",
            "expense_renewal",
            renewal.id,
            actor,
            request,
            {"name": renewal.name, "next_due_on": renewal.next_due_on},
        )
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def update_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalUpdate,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status == ExpenseRenewalStatus.ENDED:
            raise ConflictException("已结束的续费项目不能修改")
        changes = payload.model_dump(exclude_unset=True)
        if not changes:
            raise ValidationException("没有可更新字段")
        if changes.get("category_id") is not None:
            await self._active_category(int(changes["category_id"]))
        if "default_amount" in changes:
            changes["default_amount"] = money(changes["default_amount"])
        if "next_due_on" in changes:
            next_due = changes["next_due_on"]
            renewal.anchor_day = next_due.day
            renewal.anchor_month_end = is_month_end(next_due)
        for field, value in changes.items():
            setattr(renewal, field, value)
        renewal.updated_by_staff_id = actor_id(actor)
        await self._audit(
            "expense_renewal_update",
            "expense_renewal",
            renewal.id,
            actor,
            request,
            {"changes": {key: str(value) for key, value in changes.items()}},
        )
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def pause_renewal(
        self,
        renewal_id: int,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("只有进行中的续费项目可以暂停")
        renewal.status = ExpenseRenewalStatus.PAUSED
        renewal.paused_at = datetime.utcnow()
        renewal.updated_by_staff_id = actor_id(actor)
        await self._audit(
            "expense_renewal_pause",
            "expense_renewal",
            renewal.id,
            actor,
            request,
        )
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def resume_renewal(
        self,
        renewal_id: int,
        next_due_on: date,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.PAUSED:
            raise ConflictException("只有已暂停的续费项目可以恢复")
        renewal.status = ExpenseRenewalStatus.ACTIVE
        renewal.next_due_on = next_due_on
        renewal.anchor_day = next_due_on.day
        renewal.anchor_month_end = is_month_end(next_due_on)
        renewal.paused_at = None
        renewal.updated_by_staff_id = actor_id(actor)
        await self._audit(
            "expense_renewal_resume",
            "expense_renewal",
            renewal.id,
            actor,
            request,
            {"next_due_on": next_due_on},
        )
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def end_renewal(
        self,
        renewal_id: int,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status == ExpenseRenewalStatus.ENDED:
            raise ConflictException("续费项目已经结束")
        renewal.status = ExpenseRenewalStatus.ENDED
        renewal.ended_at = datetime.utcnow()
        renewal.updated_by_staff_id = actor_id(actor)
        await self._audit(
            "expense_renewal_end",
            "expense_renewal",
            renewal.id,
            actor,
            request,
        )
        await self.db.commit()
        return await self.get_renewal(renewal.id)

    async def confirm_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalConfirmRequest,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("当前续费项目不能确认入账")
        due_on = payload.due_on
        occurrence = await self._occurrence(renewal.id, due_on, lock=True)
        is_reconfirm = (
            occurrence is not None
            and occurrence.status == ExpenseOccurrenceStatus.REVERSED
        )
        if due_on != renewal.next_due_on and not is_reconfirm:
            raise ConflictException("续费周期已经变化，请刷新后重试")
        if occurrence is not None and not is_reconfirm:
            raise ConflictException("该续费周期已经处理")
        expense = ExpenseRecord(
            amount=money(
                payload.amount if payload.amount is not None else renewal.default_amount
            ),
            currency="CNY",
            expense_date=payload.expense_date or date.today(),
            title=renewal.name,
            category_id=renewal.category_id,
            payee=renewal.vendor,
            note=payload.note or renewal.note,
            status=ExpenseRecordStatus.ACTIVE,
            renewal_id=renewal.id,
            renewal_due_on=due_on,
            created_by_staff_id=actor_id(actor),
            updated_by_staff_id=actor_id(actor),
        )
        self.db.add(expense)
        try:
            await self.db.flush()
            if occurrence is None:
                occurrence = ExpenseRenewalOccurrence(
                    renewal_id=renewal.id,
                    due_on=due_on,
                    status=ExpenseOccurrenceStatus.PAID,
                    expense_id=expense.id,
                    note=payload.note,
                    processed_by_staff_id=actor_id(actor),
                )
                self.db.add(occurrence)
            else:
                occurrence.status = ExpenseOccurrenceStatus.PAID
                occurrence.expense_id = expense.id
                occurrence.note = payload.note
                occurrence.processed_by_staff_id = actor_id(actor)
                occurrence.processed_at = datetime.utcnow()
            if due_on == renewal.next_due_on:
                renewal.next_due_on = advance_due(renewal)
            renewal.updated_by_staff_id = actor_id(actor)
            await self._audit(
                "expense_renewal_reconfirm" if is_reconfirm else "expense_renewal_confirm",
                "expense_renewal",
                renewal.id,
                actor,
                request,
                {
                    "due_on": due_on,
                    "expense_id": expense.id,
                    "amount": str(expense.amount),
                },
            )
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("该续费周期已经处理，请刷新后重试") from error
        return {
            "renewal": await self.get_renewal(renewal.id),
            "expense": await fetch_expense(self.db, expense.id),
        }

    async def skip_renewal(
        self,
        renewal_id: int,
        payload: ExpenseRenewalSkipRequest,
        actor: dict[str, Any],
        request: Request,
    ) -> dict[str, Any]:
        renewal = await self._renewal(renewal_id, lock=True)
        if renewal.status != ExpenseRenewalStatus.ACTIVE:
            raise ConflictException("当前续费项目不能跳过")
        due_on = renewal.next_due_on
        if payload.due_on != due_on:
            raise ConflictException("续费周期已经变化，请刷新后重试")
        await self._assert_occurrence_available(renewal.id, due_on)
        self.db.add(
            ExpenseRenewalOccurrence(
                renewal_id=renewal.id,
                due_on=due_on,
                status=ExpenseOccurrenceStatus.SKIPPED,
                note=payload.note,
                processed_by_staff_id=actor_id(actor),
            )
        )
        renewal.next_due_on = advance_due(renewal)
        renewal.updated_by_staff_id = actor_id(actor)
        try:
            await self._audit(
                "expense_renewal_skip",
                "expense_renewal",
                renewal.id,
                actor,
                request,
                {"due_on": due_on, "note": payload.note},
            )
            await self.db.commit()
        except IntegrityError as error:
            await self.db.rollback()
            raise ConflictException("该续费周期已经处理，请刷新后重试") from error
        return await self.get_renewal(renewal.id)

    async def due_items(self, limit: int = 20) -> list[dict[str, Any]]:
        today = date.today()
        rows = (
            await self.db.execute(
                self._renewal_row_query()
                .where(
                    ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                    self._days_until_due(today) <= ExpenseRenewal.reminder_days,
                )
                .order_by(ExpenseRenewal.next_due_on, ExpenseRenewal.id)
                .limit(limit)
            )
        ).all()
        return [self._serialize_renewal_row(row) for row in rows]

    async def due_count(self) -> int:
        today = date.today()
        return int(
            (
                await self.db.execute(
                    select(func.count(ExpenseRenewal.id)).where(
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        self._days_until_due(today) <= ExpenseRenewal.reminder_days,
                    )
                )
            ).scalar()
            or 0
        )

    def _renewal_filters(
        self,
        status: str | None,
        due_state: str | None,
        keyword: str | None,
    ) -> list[Any]:
        filters: list[Any] = []
        if status:
            if status not in ExpenseRenewalStatus.ALL:
                raise ValidationException("续费状态无效")
            filters.append(ExpenseRenewal.status == status)
        today = date.today()
        if due_state:
            if due_state == "overdue":
                filters.extend(
                    [
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        ExpenseRenewal.next_due_on < today,
                    ]
                )
            elif due_state == "due":
                filters.extend(
                    [
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        ExpenseRenewal.next_due_on == today,
                    ]
                )
            elif due_state == "upcoming":
                filters.extend(
                    [
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        ExpenseRenewal.next_due_on > today,
                        self._days_until_due(today) <= ExpenseRenewal.reminder_days,
                    ]
                )
            else:
                raise ValidationException("续费到期筛选无效")
        if keyword and keyword.strip():
            value = f"%{keyword.strip()}%"
            filters.append(
                or_(ExpenseRenewal.name.ilike(value), ExpenseRenewal.vendor.ilike(value))
            )
        return filters

    @staticmethod
    def _renewal_row_query() -> Any:
        return select(ExpenseRenewal, ExpenseCategory.name).join(
            ExpenseCategory,
            ExpenseRenewal.category_id == ExpenseCategory.id,
        )

    def _serialize_renewal_row(
        self,
        row: Any,
        occurrences: list[ExpenseRenewalOccurrence] | None = None,
    ) -> dict[str, Any]:
        renewal, category_name = row
        return {
            "id": renewal.id,
            "name": renewal.name,
            "vendor": renewal.vendor,
            "default_amount": money(renewal.default_amount),
            "category_id": renewal.category_id,
            "category_name": category_name,
            "cycle": renewal.cycle,
            "next_due_on": renewal.next_due_on,
            "reminder_days": renewal.reminder_days,
            "status": renewal.status,
            "due_state": self._due_state(renewal),
            "note": renewal.note,
            "created_by_staff_id": renewal.created_by_staff_id,
            "updated_by_staff_id": renewal.updated_by_staff_id,
            "paused_at": renewal.paused_at,
            "ended_at": renewal.ended_at,
            "created_at": renewal.created_at,
            "updated_at": renewal.updated_at,
            "occurrences": [serialize_occurrence(item) for item in occurrences or []],
        }

    @staticmethod
    def _due_state(renewal: ExpenseRenewal) -> str:
        if renewal.status == ExpenseRenewalStatus.PAUSED:
            return "paused"
        if renewal.status == ExpenseRenewalStatus.ENDED:
            return "ended"
        today = date.today()
        if renewal.next_due_on < today:
            return "overdue"
        if renewal.next_due_on == today:
            return "due"
        if renewal.next_due_on <= today + timedelta(days=renewal.reminder_days):
            return "upcoming"
        return "scheduled"

    async def _assert_occurrence_available(self, renewal_id: int, due_on: date) -> None:
        existing = (
            await self.db.execute(
                select(ExpenseRenewalOccurrence.id).where(
                    ExpenseRenewalOccurrence.renewal_id == renewal_id,
                    ExpenseRenewalOccurrence.due_on == due_on,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise ConflictException("该续费周期已经处理")

    async def _occurrence(
        self,
        renewal_id: int,
        due_on: date,
        *,
        lock: bool = False,
    ) -> ExpenseRenewalOccurrence | None:
        query = select(ExpenseRenewalOccurrence).where(
            ExpenseRenewalOccurrence.renewal_id == renewal_id,
            ExpenseRenewalOccurrence.due_on == due_on,
        )
        if lock:
            query = query.with_for_update()
        return (await self.db.execute(query)).scalar_one_or_none()

    @staticmethod
    def serialize_occurrence(
        occurrence: ExpenseRenewalOccurrence,
    ) -> dict[str, Any]:
        """Compatibility method retained for the original aggregate service."""
        return serialize_occurrence(occurrence)


__all__ = [
    "CYCLE_MONTHS",
    "ExpenseRenewalService",
    "advance_due",
    "is_month_end",
    "serialize_occurrence",
]
