"""Shared primitives for the company-expense domain services."""

from __future__ import annotations

import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.exceptions import ConflictException, NotFoundException, ValidationException
from models import (
    ExpenseCategory,
    ExpenseCategoryStatus,
    ExpenseRecord,
    ExpenseRenewal,
)

CENT = Decimal("0.01")


def money(value: object) -> Decimal:
    """Normalize persisted and calculated amounts to currency precision."""
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def month_start(value: str | None) -> date:
    """Parse a YYYY-MM filter, defaulting to the current month."""
    if not value:
        today = date.today()
        return today.replace(day=1)
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise ValidationException("月份格式必须为 YYYY-MM")
    try:
        return date.fromisoformat(f"{value}-01")
    except ValueError as error:
        raise ValidationException("月份无效") from error


def shift_month(value: date, months: int) -> date:
    """Return the first day of the month at ``months`` from ``value``."""
    zero_based = value.year * 12 + value.month - 1 + months
    return date(zero_based // 12, zero_based % 12 + 1, 1)


def actor_id(actor: dict[str, Any]) -> int | None:
    value = actor.get("staff_id")
    return int(value) if value is not None else None


def actor_name(actor: dict[str, Any]) -> str:
    return str(actor.get("username") or actor.get("display_name") or "staff")


class ExpenseServiceBase:
    """Database and audit helpers shared by the focused expense services."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _category(self, category_id: int) -> ExpenseCategory:
        category = (
            await self.db.execute(select(ExpenseCategory).where(ExpenseCategory.id == category_id))
        ).scalar_one_or_none()
        if category is None:
            raise NotFoundException("支出分类不存在")
        return category

    async def _active_category(self, category_id: int) -> ExpenseCategory:
        category = await self._category(category_id)
        if category.status != ExpenseCategoryStatus.ACTIVE:
            raise ConflictException("该支出分类已停用")
        return category

    async def _expense(self, expense_id: int, lock: bool = False) -> ExpenseRecord:
        query = select(ExpenseRecord).where(ExpenseRecord.id == expense_id)
        if lock:
            query = query.with_for_update()
        record = (await self.db.execute(query)).scalar_one_or_none()
        if record is None:
            raise NotFoundException("支出记录不存在")
        return record

    async def _renewal(self, renewal_id: int, lock: bool = False) -> ExpenseRenewal:
        query = select(ExpenseRenewal).where(ExpenseRenewal.id == renewal_id)
        if lock:
            query = query.with_for_update()
        renewal = (await self.db.execute(query)).scalar_one_or_none()
        if renewal is None:
            raise NotFoundException("续费项目不存在")
        return renewal

    def _days_until_due(self, today: date) -> Any:
        dialect = self.db.get_bind().dialect.name
        if dialect == "sqlite":
            return func.julianday(ExpenseRenewal.next_due_on) - func.julianday(today)
        if dialect in {"mysql", "mariadb"}:
            return func.datediff(ExpenseRenewal.next_due_on, today)
        return ExpenseRenewal.next_due_on - today

    async def _audit(
        self,
        action: str,
        target_type: str,
        target_id: int,
        actor: dict[str, Any],
        request: Request,
        detail: dict[str, Any] | None = None,
    ) -> None:
        await log_admin_action(
            self.db,
            user_id=actor_id(actor),
            user_name=actor_name(actor),
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            request=request,
        )


__all__ = [
    "CENT",
    "ExpenseServiceBase",
    "actor_id",
    "actor_name",
    "money",
    "month_start",
    "shift_month",
]
