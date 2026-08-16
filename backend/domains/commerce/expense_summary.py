"""Read-optimized company-expense summaries for the operations dashboard."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select

from models import (
    ExpenseCategory,
    ExpenseRecord,
    ExpenseRecordStatus,
    ExpenseRenewal,
    ExpenseRenewalStatus,
)

from .expense_common import ExpenseServiceBase, money, month_start, shift_month


class ExpenseSummaryReadModel(ExpenseServiceBase):
    """Build month, trend, category and renewal projections without writes."""

    async def summary(self, month: str | None = None) -> dict[str, Any]:
        start = month_start(month)
        end = shift_month(start, 1)
        previous = shift_month(start, -1)

        async def total_between(begin: date, finish: date) -> tuple[Decimal, int]:
            row = (
                await self.db.execute(
                    select(
                        func.coalesce(func.sum(ExpenseRecord.amount), 0),
                        func.count(ExpenseRecord.id),
                    ).where(
                        ExpenseRecord.status == ExpenseRecordStatus.ACTIVE,
                        ExpenseRecord.expense_date >= begin,
                        ExpenseRecord.expense_date < finish,
                    )
                )
            ).one()
            return money(row[0]), int(row[1] or 0)

        total, count = await total_between(start, end)
        previous_total, _ = await total_between(previous, start)
        if previous_total == 0:
            change = Decimal("0") if total == 0 else Decimal("100")
        else:
            change = ((total - previous_total) / previous_total * 100).quantize(
                Decimal("0.1"),
                rounding=ROUND_HALF_UP,
            )

        category_rows = (
            await self.db.execute(
                select(
                    ExpenseCategory.id,
                    ExpenseCategory.name,
                    func.coalesce(func.sum(ExpenseRecord.amount), 0),
                )
                .join(ExpenseRecord, ExpenseRecord.category_id == ExpenseCategory.id)
                .where(
                    ExpenseRecord.status == ExpenseRecordStatus.ACTIVE,
                    ExpenseRecord.expense_date >= start,
                    ExpenseRecord.expense_date < end,
                )
                .group_by(ExpenseCategory.id, ExpenseCategory.name)
                .order_by(func.sum(ExpenseRecord.amount).desc())
            )
        ).all()
        categories = []
        for category_id, name, value in category_rows:
            category_total = money(value)
            percentage = (
                Decimal("0")
                if total == 0
                else (category_total / total * 100).quantize(
                    Decimal("0.1"),
                    rounding=ROUND_HALF_UP,
                )
            )
            categories.append(
                {
                    "category_id": category_id,
                    "category_name": name,
                    "total": category_total,
                    "percentage": percentage,
                }
            )

        trend = []
        for offset in range(-5, 1):
            trend_start = shift_month(start, offset)
            trend_end = shift_month(trend_start, 1)
            trend_total, _ = await total_between(trend_start, trend_end)
            trend.append(
                {"month": trend_start.strftime("%Y-%m"), "total": trend_total}
            )

        today = date.today()
        upcoming = int(
            (
                await self.db.execute(
                    select(func.count(ExpenseRenewal.id)).where(
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        ExpenseRenewal.next_due_on >= today,
                        self._days_until_due(today) <= ExpenseRenewal.reminder_days,
                    )
                )
            ).scalar()
            or 0
        )
        overdue = int(
            (
                await self.db.execute(
                    select(func.count(ExpenseRenewal.id)).where(
                        ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE,
                        ExpenseRenewal.next_due_on < today,
                    )
                )
            ).scalar()
            or 0
        )
        return {
            "month": start.strftime("%Y-%m"),
            "total": total,
            "previous_total": previous_total,
            "change_percent": change,
            "count": count,
            "upcoming_renewals": upcoming,
            "overdue_renewals": overdue,
            "trend": trend,
            "categories": categories,
        }


__all__ = ["ExpenseSummaryReadModel"]
