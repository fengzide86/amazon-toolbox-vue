"""enforce activation and expense ledger integrity

Revision ID: 20260816_data_integrity
Revises: 20260731_company_expenses
Create Date: 2026-08-16
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260816_data_integrity"
down_revision = "20260731_company_expenses"
branch_labels = None
depends_on = None


def _unique_names(inspector: sa.Inspector, table: str) -> set[str]:
    return {
        str(item["name"])
        for item in inspector.get_unique_constraints(table)
        if item.get("name")
    }


def _duplicate_group_count(
    bind: sa.Connection,
    table: str,
    columns: tuple[str, ...],
    *,
    where: str | None = None,
) -> int:
    column_sql = ", ".join(columns)
    where_sql = f" WHERE {where}" if where else ""
    statement = sa.text(
        "SELECT COUNT(*) FROM ("
        f"SELECT {column_sql} FROM {table}{where_sql} "
        f"GROUP BY {column_sql} HAVING COUNT(*) > 1"
        ") AS duplicate_groups"
    )
    return int(bind.execute(statement).scalar_one())


def _assert_no_duplicates(
    bind: sa.Connection,
    table: str,
    columns: tuple[str, ...],
    constraint_name: str,
    *,
    where: str | None = None,
) -> None:
    duplicate_groups = _duplicate_group_count(bind, table, columns, where=where)
    if duplicate_groups:
        raise RuntimeError(
            f"cannot create {constraint_name}: {table} contains "
            f"{duplicate_groups} duplicate group(s); resolve them explicitly before retrying"
        )


def _replace_check_constraint(table: str, name: str, expression: str) -> None:
    inspector = sa.inspect(op.get_bind())
    checks = {str(item.get("name")): str(item.get("sqltext") or "") for item in inspector.get_check_constraints(table)}
    current = checks.get(name, "")
    normalized_expression = "".join(expression.lower().split())
    if normalized_expression in "".join(current.lower().split()):
        return
    with op.batch_alter_table(table) as batch_op:
        if name in checks:
            batch_op.drop_constraint(name, type_="check")
        batch_op.create_check_constraint(name, expression)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    unique_specs = (
        (
            "users",
            ("auth_code_id",),
            "ux_users_auth_code_id",
            "auth_code_id IS NOT NULL",
        ),
        (
            "devices",
            ("auth_code_id", "device_id"),
            "ux_devices_auth_code_device",
            None,
        ),
        (
            "auth_seats",
            ("auth_code_id", "device_id"),
            "ux_auth_seats_auth_code_device",
            "device_id IS NOT NULL",
        ),
    )
    # Run every data preflight before the first DDL statement. MariaDB DDL is
    # not transactional, so a late failure must not leave a half-applied schema.
    for table, columns, constraint_name, where in unique_specs:
        _assert_no_duplicates(
            bind,
            table,
            columns,
            constraint_name,
            where=where,
        )

    oversized_batches = int(
        bind.execute(sa.text("SELECT COUNT(*) FROM demo_batches WHERE row_count > 50")).scalar_one()
    )
    if oversized_batches:
        raise RuntimeError(
            "cannot enforce 50-row demo limit: demo_batches contains "
            f"{oversized_batches} oversized historical batch(es)"
        )

    for table, columns, constraint_name, _where in unique_specs:
        if constraint_name not in _unique_names(inspector, table):
            with op.batch_alter_table(table) as batch_op:
                batch_op.create_unique_constraint(constraint_name, list(columns))
            inspector = sa.inspect(bind)

    expense_uniques = _unique_names(inspector, "expense_records")
    if "ux_expense_records_renewal_due" in expense_uniques:
        with op.batch_alter_table("expense_records") as batch_op:
            batch_op.drop_constraint("ux_expense_records_renewal_due", type_="unique")

    _replace_check_constraint(
        "expense_renewal_occurrences",
        "ck_expense_occurrences_status",
        "status IN ('paid', 'skipped', 'reversed')",
    )

    _replace_check_constraint(
        "demo_batches",
        "ck_demo_batches_row_count",
        "row_count > 0 AND row_count <= 50",
    )


def downgrade() -> None:
    bind = op.get_bind()
    reversed_count = int(
        bind.execute(
            sa.text("SELECT COUNT(*) FROM expense_renewal_occurrences WHERE status = 'reversed'")
        ).scalar_one()
    )
    if reversed_count:
        raise RuntimeError(
            "cannot downgrade while reversed renewal occurrences exist; preserve and reconcile them first"
        )

    _replace_check_constraint(
        "expense_renewal_occurrences",
        "ck_expense_occurrences_status",
        "status IN ('paid', 'skipped')",
    )
    _replace_check_constraint(
        "demo_batches",
        "ck_demo_batches_row_count",
        "row_count > 0",
    )

    if _duplicate_group_count(
        bind,
        "expense_records",
        ("renewal_id", "renewal_due_on"),
        where="renewal_id IS NOT NULL AND renewal_due_on IS NOT NULL",
    ):
        raise RuntimeError(
            "cannot restore ux_expense_records_renewal_due while renewed historical records exist"
        )
    inspector = sa.inspect(bind)
    if "ux_expense_records_renewal_due" not in _unique_names(inspector, "expense_records"):
        with op.batch_alter_table("expense_records") as batch_op:
            batch_op.create_unique_constraint(
                "ux_expense_records_renewal_due",
                ["renewal_id", "renewal_due_on"],
            )

    for table, constraint_name in (
        ("auth_seats", "ux_auth_seats_auth_code_device"),
        ("devices", "ux_devices_auth_code_device"),
        ("users", "ux_users_auth_code_id"),
    ):
        inspector = sa.inspect(bind)
        if constraint_name in _unique_names(inspector, table):
            with op.batch_alter_table(table) as batch_op:
                batch_op.drop_constraint(constraint_name, type_="unique")
