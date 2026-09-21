"""Add scoped channel partners without adopting historical orders or customers.

Revision ID: 20260921_agency_workspace
Revises: 20260816_data_integrity
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260921_agency_workspace"
down_revision = "20260816_data_integrity"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add_fk(table: str, column: str, target: str) -> None:
    if column in _columns(table):
        return
    with op.batch_alter_table(table) as batch:
        batch.add_column(sa.Column(column, sa.Integer(), nullable=True))
        batch.create_foreign_key(f"fk_{table}_{column}", target, [column], ["id"])
        if column != "order_id":
            batch.create_index(f"ix_{table}_{column}", [column])


def _remove_fk_column(table: str, column: str) -> None:
    inspector = sa.inspect(op.get_bind())
    naming = {"fk": "fk_%(table_name)s_%(column_0_name)s"}
    with op.batch_alter_table(table, naming_convention=naming) as batch:
        for fk in inspector.get_foreign_keys(table):
            if column in fk["constrained_columns"]:
                batch.drop_constraint(fk["name"] or f"fk_{table}_{column}", type_="foreignkey")
        for index in inspector.get_indexes(table):
            if column in index["column_names"]:
                batch.drop_index(index["name"])
        batch.drop_column(column)


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "agencies" not in tables:
        op.create_table(
            "agencies",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("contact", sa.String(200)),
            sa.Column("notes", sa.Text()),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_agencies_status"),
        )
    if "agency_customers" not in tables:
        op.create_table(
            "agency_customers",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("contact", sa.String(200)),
            sa.Column("notes", sa.Text()),
            sa.Column("created_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_agency_customers_agency_id", "agency_customers", ["agency_id"])
    _add_fk("staff_users", "agency_id", "agencies")
    checks = {item["name"]: item["sqltext"] for item in sa.inspect(op.get_bind()).get_check_constraints("staff_users")}
    with op.batch_alter_table("staff_users") as batch:
        if "'agent'" not in checks.get("ck_staff_users_role", ""):
            if "ck_staff_users_role" in checks:
                batch.drop_constraint("ck_staff_users_role", type_="check")
            batch.create_check_constraint("ck_staff_users_role", "role IN ('super_admin', 'operator', 'support', 'agent')")
        if "ck_staff_users_agent_agency" not in checks:
            batch.create_check_constraint("ck_staff_users_agent_agency", "role != 'agent' OR agency_id IS NOT NULL")
    for table in ("orders", "auth_codes"):
        _add_fk(table, "agency_id", "agencies")
        _add_fk(table, "customer_id", "agency_customers")
    with op.batch_alter_table("orders") as batch:
        for field in ("agency_note", "delivery_entitlements_snapshot"):
            if field not in _columns("orders"):
                batch.add_column(sa.Column(field, sa.Text(), nullable=True))
    _add_fk("auth_codes", "order_id", "orders")
    uniques = {item["name"] for item in sa.inspect(op.get_bind()).get_unique_constraints("auth_codes")}
    if "ux_auth_codes_order_id" not in uniques:
        with op.batch_alter_table("auth_codes") as batch:
            batch.create_unique_constraint("ux_auth_codes_order_id", ["order_id"])
    if "agency_requests" not in tables:
        op.create_table(
            "agency_requests",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("agency_id", sa.Integer(), sa.ForeignKey("agencies.id"), nullable=False),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("agency_customers.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id")),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("response", sa.Text()),
            sa.Column("created_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id"), nullable=False),
            sa.Column("resolved_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("resolved_at", sa.DateTime()),
            sa.CheckConstraint("kind IN ('support', 'refund', 'extension')", name="ck_agency_requests_kind"),
            sa.CheckConstraint("status IN ('open', 'resolved', 'rejected')", name="ck_agency_requests_status"),
        )
        for field in ("agency_id", "customer_id", "order_id"):
            op.create_index(f"ix_agency_requests_{field}", "agency_requests", [field])


def downgrade() -> None:
    # Downgrade is destructive once partners have been used. Never delete their history silently.
    bind = op.get_bind()
    for table in ("agencies", "agency_customers", "agency_requests"):
        if bind.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar_one():
            raise RuntimeError("Agency history exists; export and reconcile it before downgrading")
    if bind.execute(sa.text("SELECT COUNT(*) FROM staff_users WHERE role = 'agent'")).scalar_one():
        raise RuntimeError("Agent accounts exist; reassign them before downgrading")
    op.drop_table("agency_requests")
    with op.batch_alter_table("auth_codes") as batch:
        batch.drop_constraint("ux_auth_codes_order_id", type_="unique")
    _remove_fk_column("auth_codes", "order_id")
    for table in ("auth_codes", "orders"):
        _remove_fk_column(table, "agency_id")
        _remove_fk_column(table, "customer_id")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("agency_note")
        batch.drop_column("delivery_entitlements_snapshot")
    with op.batch_alter_table("staff_users") as batch:
        batch.drop_constraint("ck_staff_users_agent_agency", type_="check")
        batch.drop_constraint("ck_staff_users_role", type_="check")
        batch.create_check_constraint("ck_staff_users_role", "role IN ('super_admin', 'operator', 'support')")
    _remove_fk_column("staff_users", "agency_id")
    op.drop_table("agency_customers")
    op.drop_table("agencies")
