"""Read-optimized company-expense summaries for the operations dashboard."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import case, func, select

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

        # Keep the six-month trend, current-month totals and previous-month
        # comparison in one range query.  The previous implementation issued
        # one aggregate per month (plus two more for current/previous totals),
        # which made every dashboard refresh perform eight round trips before
        # categories and renewals were even loaded.
        trend_start = shift_month(start, -5)
        dialect = self.db.get_bind().dialect.name
        if dialect == "sqlite":
            month_key = func.strftime("%Y-%m", ExpenseRecord.expense_date)
        elif dialect in {"mysql", "mariadb"}:
            month_key = func.date_format(ExpenseRecord.expense_date, "%Y-%m")
        else:
            # PostgreSQL and compatible engines expose the same ISO month
            # representation through to_char.  This branch is not used by the
            # supported test/runtime engines, but keeps the read model useful
            # for local tooling.
            month_key = func.to_char(ExpenseRecord.expense_date, "YYYY-MM")
        trend_rows = (
            await self.db.execute(
                select(
                    month_key.label("month"),
                    func.coalesce(func.sum(ExpenseRecord.amount), 0),
                    func.count(ExpenseRecord.id),
                )
                .where(
                    ExpenseRecord.status == ExpenseRecordStatus.ACTIVE,
                    ExpenseRecord.expense_date >= trend_start,
                    ExpenseRecord.expense_date < end,
                )
                .group_by(month_key)
            )
        ).all()
        totals_by_month = {
            str(row[0]): (money(row[1]), int(row[2] or 0)) for row in trend_rows
        }
        current_key = start.strftime("%Y-%m")
        previous_key = previous.strftime("%Y-%m")
        total, count = totals_by_month.get(current_key, (Decimal("0.00"), 0))
        previous_total, _ = totals_by_month.get(
            previous_key, (Decimal("0.00"), 0)
        )
        if previous_total == 0:
            change = Decimal("0") if total == 0 else None
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
            point_start = shift_month(start, offset)
            point_key = point_start.strftime("%Y-%m")
            trend_total = totals_by_month.get(
                point_key, (Decimal("0.00"), 0)
            )[0]
            trend.append(
                {"month": point_key, "total": trend_total}
            )

        today = date.today()
        due_days = self._days_until_due(today)
        renewal_counts = (
            await self.db.execute(
                select(
                    func.coalesce(
                        func.sum(
                            case(
                                (
                                    (ExpenseRenewal.next_due_on >= today)
                                    & (due_days <= ExpenseRenewal.reminder_days),
                                    1,
                                ),
                                else_=0,
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(
                            case((ExpenseRenewal.next_due_on < today, 1), else_=0)
                        ),
                        0,
                    ),
                ).where(ExpenseRenewal.status == ExpenseRenewalStatus.ACTIVE)
            )
        ).one()
        upcoming, overdue = (int(renewal_counts[0] or 0), int(renewal_counts[1] or 0))
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
