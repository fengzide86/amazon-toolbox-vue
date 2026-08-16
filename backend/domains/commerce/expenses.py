"""Compatibility facade for the focused company-expense domain services.

The public ``ExpenseService`` API remains stable for routers and callers while
ledger, renewal, attachment and summary responsibilities live in dedicated
modules.
"""

from __future__ import annotations

from .expense_attachments import (
    ALLOWED_ATTACHMENTS,
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS,
    ExpenseAttachmentService,
    attachment_root,
    validate_expense_attachment_storage,
)
from .expense_common import CENT, actor_id, actor_name, money, month_start, shift_month
from .expense_ledger import DEFAULT_CATEGORIES, ExpenseLedgerService
from .expense_renewals import (
    CYCLE_MONTHS,
    ExpenseRenewalService,
    advance_due,
    is_month_end,
)
from .expense_summary import ExpenseSummaryReadModel


class ExpenseService(
    ExpenseLedgerService,
    ExpenseAttachmentService,
    ExpenseRenewalService,
    ExpenseSummaryReadModel,
):
    """Stable aggregate facade used by the existing API routers."""


# Keep the original module-level private names available to older tests and
# internal callers during the modular-monolith migration.
_money = money
_month_start = month_start
_shift_month = shift_month
_is_month_end = is_month_end
_advance_due = advance_due
_attachment_root = attachment_root
_actor_id = actor_id
_actor_name = actor_name

__all__ = [
    "ALLOWED_ATTACHMENTS",
    "CENT",
    "CYCLE_MONTHS",
    "DEFAULT_CATEGORIES",
    "MAX_ATTACHMENT_BYTES",
    "MAX_ATTACHMENTS",
    "ExpenseService",
    "validate_expense_attachment_storage",
]
