"""Add opt-in partner commissions; never backfill historical orders.

Revision ID: 20260922_agency_commission
Revises: 20260921_agency_workspace
"""

import sqlalchemy as sa

from alembic import op

revision = "20260922_agency_commission"
down_revision = "20260921_agency_workspace"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _inspector().get_table_names()


def _column_exists(table: str, column: str) -> bool:
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _index_exists(table: str, name: str) -> bool:
    return name in {item["name"] for item in _inspector().get_indexes(table)}


def upgrade() -> None:
    # SQLite reconstructs this legacy table during tests.  Give Alembic a
    # complete column order because the new check constraint references both
    # the new and existing columns; without it SQLAlchemy can report a
    # circular dependency while ordering the recreated table.
    if not _column_exists("agencies", "commission_rate"):
        with op.batch_alter_table(
            "agencies",
            partial_reordering=[("id", "name", "contact", "notes", "commission_rate", "status", "created_at")],
        ) as batch:
            batch.add_column(sa.Column("commission_rate", sa.Numeric(7, 6), nullable=True))
    if "ck_agencies_commission_rate" not in {item["name"] for item in _inspector().get_check_constraints("agencies")}:
        with op.batch_alter_table(
            "agencies",
            partial_reordering=[("id", "name", "contact", "notes", "commission_rate", "status", "created_at")],
        ) as batch:
            batch.create_check_constraint("ck_agencies_commission_rate", "commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)")
    if not _table_exists("agency_commission_settlements"):
        op.create_table(
            "agency_commission_settlements",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=False),
            sa.Column("month", sa.String(7), nullable=False),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False),
            sa.Column("revision", sa.String(64), nullable=False),
            sa.Column("note", sa.String(1000), nullable=False),
            sa.Column("confirmed_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("confirmed_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("agency_id", "month", name="ux_agency_settlement_month"),
            sa.CheckConstraint("amount >= 0", name="ck_agency_settlement_nonnegative"),
            sa.CheckConstraint("count > 0", name="ck_agency_settlement_count"),
        )
    if not _index_exists("agency_commission_settlements", "ix_agency_commission_settlements_agency_id"):
        op.create_index("ix_agency_commission_settlements_agency_id", "agency_commission_settlements", ["agency_id"])
    if not _table_exists("agency_commission_entries"):
        op.create_table(
            "agency_commission_entries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
            sa.Column("order_no", sa.String(100), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("rate_snapshot", sa.Numeric(7, 6), nullable=False),
            sa.Column("order_amount_snapshot", sa.Numeric(12, 2), nullable=False),
            sa.Column("occurred_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("settlement_id", sa.Integer(), sa.ForeignKey("agency_commission_settlements.id")),
            sa.UniqueConstraint("order_id", "kind", name="ux_agency_commission_order_kind"),
            sa.CheckConstraint("kind IN ('accrual', 'refund')", name="ck_agency_commission_kind"),
            sa.CheckConstraint("(kind = 'accrual' AND amount >= 0) OR (kind = 'refund' AND amount <= 0)", name="ck_agency_commission_sign"),
            sa.CheckConstraint("rate_snapshot >= 0 AND rate_snapshot <= 1", name="ck_agency_commission_rate"),
        )
    for index_name, columns in (
        ("ix_agency_commission_entries_agency_id", ["agency_id"]),
        ("ix_agency_commission_entries_settlement_id", ["settlement_id"]),
        ("ix_agency_commission_pending", ["agency_id", "settlement_id", "occurred_at"]),
    ):
        if not _index_exists("agency_commission_entries", index_name):
            op.create_index(index_name, "agency_commission_entries", columns)


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("agency_commission_entries", "agency_commission_settlements"):
        if bind.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar_one():
            raise RuntimeError("Commission history exists; reconcile and export before downgrading")
    op.drop_table("agency_commission_entries")
    op.drop_table("agency_commission_settlements")
    with op.batch_alter_table("agencies") as batch:
        batch.drop_constraint("ck_agencies_commission_rate", type_="check")
        batch.drop_column("commission_rate")
