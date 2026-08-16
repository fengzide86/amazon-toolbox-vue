"""add internal company expense and renewal ledgers

Revision ID: 20260731_company_expenses
Revises: 20260718_audit_target_id_string
Create Date: 2026-07-31
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260731_company_expenses"
down_revision = "20260718_audit_target_id_string"
branch_labels = None
depends_on = None


DEFAULT_CATEGORIES = (
    ("development", "开发", 10),
    ("marketing", "市场", 20),
    ("tool_membership", "工具会员", 30),
    ("server_cloud", "服务器/云服务", 40),
    ("operations", "日常运营", 50),
    ("tax_fees", "税费", 60),
    ("other", "其他", 70),
)

EXPENSE_TABLES = {
    "expense_categories",
    "expense_renewals",
    "expense_records",
    "expense_attachments",
    "expense_renewal_occurrences",
}


def _insert_default_categories() -> None:
    categories = sa.table(
        "expense_categories",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("status", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_system", sa.Boolean()),
    )
    op.bulk_insert(categories, [
        {"code": code, "name": name, "status": "active", "sort_order": order, "is_system": True}
        for code, name, order in DEFAULT_CATEGORIES
    ])


def upgrade() -> None:
    # The first historical migration uses the current model metadata when a
    # completely new database is created. In that one case all five tables
    # already exist by the time Alembic reaches this revision; only seed data
    # and the revision stamp are still missing. Existing deployed databases do
    # not have these tables and follow the normal explicit DDL path below.
    inspector = sa.inspect(op.get_bind())
    existing_tables = {name for name in EXPENSE_TABLES if inspector.has_table(name)}
    if existing_tables:
        if existing_tables != EXPENSE_TABLES:
            missing = ", ".join(sorted(EXPENSE_TABLES - existing_tables))
            raise RuntimeError(f"partial expense schema detected; missing tables: {missing}")
        category_count = op.get_bind().execute(sa.text("SELECT COUNT(*) FROM expense_categories")).scalar_one()
        if not category_count:
            _insert_default_categories()
        return

    op.create_table(
        "expense_categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_expense_categories_status"),
        sa.UniqueConstraint("code", name="ux_expense_categories_code"),
        sa.UniqueConstraint("name", name="ux_expense_categories_name"),
    )
    op.create_index("ix_expense_categories_status", "expense_categories", ["status"])
    op.create_index("ix_expense_categories_status_sort", "expense_categories", ["status", "sort_order"])

    _insert_default_categories()

    op.create_table(
        "expense_renewals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("vendor", sa.String(length=200), nullable=True),
        sa.Column("default_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("expense_categories.id"), nullable=False),
        sa.Column("cycle", sa.String(length=20), nullable=False),
        sa.Column("next_due_on", sa.Date(), nullable=False),
        sa.Column("reminder_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("anchor_day", sa.Integer(), nullable=False),
        sa.Column("anchor_month_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("updated_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("paused_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("default_amount > 0", name="ck_expense_renewals_amount_positive"),
        sa.CheckConstraint("reminder_days >= 0 AND reminder_days <= 90", name="ck_expense_renewals_reminder_days"),
        sa.CheckConstraint("anchor_day >= 1 AND anchor_day <= 31", name="ck_expense_renewals_anchor_day"),
        sa.CheckConstraint("cycle IN ('monthly', 'quarterly', 'semiannual', 'annual')", name="ck_expense_renewals_cycle"),
        sa.CheckConstraint("status IN ('active', 'paused', 'ended')", name="ck_expense_renewals_status"),
    )
    op.create_index("ix_expense_renewals_category_id", "expense_renewals", ["category_id"])
    op.create_index("ix_expense_renewals_next_due_on", "expense_renewals", ["next_due_on"])
    op.create_index("ix_expense_renewals_status", "expense_renewals", ["status"])
    op.create_index("ix_expense_renewals_status_due", "expense_renewals", ["status", "next_due_on"])

    op.create_table(
        "expense_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("expense_categories.id"), nullable=False),
        sa.Column("payee", sa.String(length=200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("renewal_id", sa.Integer(), sa.ForeignKey("expense_renewals.id"), nullable=True),
        sa.Column("renewal_due_on", sa.Date(), nullable=True),
        sa.Column("created_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("updated_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("voided_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        sa.Column("void_reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_expense_records_amount_positive"),
        sa.CheckConstraint("currency = 'CNY'", name="ck_expense_records_currency"),
        sa.CheckConstraint("status IN ('active', 'voided')", name="ck_expense_records_status"),
        sa.UniqueConstraint("renewal_id", "renewal_due_on", name="ux_expense_records_renewal_due"),
    )
    op.create_index("ix_expense_records_expense_date", "expense_records", ["expense_date"])
    op.create_index("ix_expense_records_category_id", "expense_records", ["category_id"])
    op.create_index("ix_expense_records_status", "expense_records", ["status"])
    op.create_index("ix_expense_records_renewal_id", "expense_records", ["renewal_id"])
    op.create_index("ix_expense_records_created_by_staff_id", "expense_records", ["created_by_staff_id"])
    op.create_index("ix_expense_records_status_date", "expense_records", ["status", "expense_date"])
    op.create_index("ix_expense_records_category_date", "expense_records", ["category_id", "expense_date"])

    op.create_table(
        "expense_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("expense_id", sa.Integer(), sa.ForeignKey("expense_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("uploaded_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("size_bytes > 0", name="ck_expense_attachments_size_positive"),
        sa.UniqueConstraint("storage_key", name="ux_expense_attachments_storage_key"),
    )
    op.create_index("ix_expense_attachments_expense_id", "expense_attachments", ["expense_id"])
    op.create_index("ix_expense_attachments_expense_created", "expense_attachments", ["expense_id", "created_at"])

    op.create_table(
        "expense_renewal_occurrences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("renewal_id", sa.Integer(), sa.ForeignKey("expense_renewals.id"), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("expense_id", sa.Integer(), sa.ForeignKey("expense_records.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("processed_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('paid', 'skipped')", name="ck_expense_occurrences_status"),
        sa.UniqueConstraint("renewal_id", "due_on", name="ux_expense_occurrences_renewal_due"),
        sa.UniqueConstraint("expense_id", name="ux_expense_occurrences_expense_id"),
    )
    op.create_index("ix_expense_occurrences_renewal_id", "expense_renewal_occurrences", ["renewal_id"])
    op.create_index("ix_expense_occurrences_renewal_processed", "expense_renewal_occurrences", ["renewal_id", "processed_at"])


def downgrade() -> None:
    op.drop_table("expense_renewal_occurrences")
    op.drop_table("expense_attachments")
    op.drop_table("expense_records")
    op.drop_table("expense_renewals")
    op.drop_table("expense_categories")
