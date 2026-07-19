"""add fixed staff roles and transactional commerce ledger

Revision ID: 20260718_staff_commerce
Revises: 20260715_update_announcements
Create Date: 2026-07-18
"""

import sqlalchemy as sa

from alembic import op

revision = "20260718_staff_commerce"
down_revision = "20260715_update_announcements"
branch_labels = None
depends_on = None


def _columns(inspector, table: str) -> set[str]:
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def _index_names(inspector, table: str) -> set[str]:
    if table not in inspector.get_table_names():
        return set()
    names = {index["name"] for index in inspector.get_indexes(table) if index.get("name")}
    names.update(
        constraint["name"]
        for constraint in inspector.get_unique_constraints(table)
        if constraint.get("name")
    )
    return names


def _check_names(inspector, table: str) -> set[str]:
    if table not in inspector.get_table_names():
        return set()
    return {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table)
        if constraint.get("name")
    }


def _ensure_check_constraints(
    table: str,
    constraints: tuple[tuple[str, str], ...],
) -> None:
    """Create only the named checks missing from an upgraded legacy table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = _check_names(inspector, table)
    missing = [constraint for constraint in constraints if constraint[0] not in existing]
    if not missing:
        return

    # Batch mode rebuilds SQLite tables and emits normal ALTER TABLE statements
    # on MariaDB, keeping this revision portable across both supported databases.
    with op.batch_alter_table(table) as batch_op:
        for name, condition in missing:
            batch_op.create_check_constraint(name, condition)


def _add_column(table: str, column: sa.Column) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if column.name not in _columns(inspector, table):
        if bind.dialect.name == "sqlite" and column.foreign_keys:
            # SQLite cannot add a foreign-key constraint without rebuilding
            # the whole table. Local development keeps the typed column while
            # MariaDB receives the declared FK below.
            column = sa.Column(
                column.name,
                column.type,
                nullable=column.nullable,
                server_default=column.server_default,
            )
        op.add_column(table, column)


def _deduplicate_plan_names(bind) -> None:
    rows = bind.execute(sa.text("SELECT id, name FROM plans ORDER BY id")).fetchall()
    seen: set[str] = set()
    for plan_id, raw_name in rows:
        name = str(raw_name or "").strip() or f"未命名套餐-{plan_id}"
        candidate = name
        if candidate in seen:
            candidate = f"{name} ({plan_id})"
            bind.execute(
                sa.text("UPDATE plans SET name = :name WHERE id = :plan_id"),
                {"name": candidate, "plan_id": plan_id},
            )
        seen.add(candidate)


def _deduplicate_profit_records(bind) -> None:
    bind.execute(sa.text("DELETE FROM profit_records WHERE order_id IS NULL"))
    duplicate_orders = bind.execute(
        sa.text(
            "SELECT order_id FROM profit_records "
            "GROUP BY order_id HAVING COUNT(*) > 1"
        )
    ).fetchall()
    for (order_id,) in duplicate_orders:
        record_ids = [
            row[0]
            for row in bind.execute(
                sa.text(
                    "SELECT id FROM profit_records "
                    "WHERE order_id = :order_id ORDER BY id"
                ),
                {"order_id": order_id},
            ).fetchall()
        ]
        for record_id in record_ids[1:]:
            bind.execute(
                sa.text("DELETE FROM profit_records WHERE id = :record_id"),
                {"record_id": record_id},
            )


def _migrate_legacy_admin(bind) -> None:
    settings_table = sa.table(
        "settings",
        sa.column("key", sa.String),
        sa.column("value", sa.Text),
    )
    legacy = bind.execute(
        sa.select(settings_table.c.value).where(settings_table.c.key == "admin_password")
    ).first()
    existing = bind.execute(
        sa.text("SELECT id FROM staff_users WHERE username = 'admin'")
    ).first()
    value = str(legacy[0] or "").strip() if legacy else ""
    if not existing and value.startswith(("$2a$", "$2b$", "$2y$")):
        staff_users = sa.table(
            "staff_users",
            sa.column("username", sa.String),
            sa.column("display_name", sa.String),
            sa.column("password_hash", sa.String),
            sa.column("role", sa.String),
            sa.column("status", sa.String),
            sa.column("token_version", sa.Integer),
            sa.column("force_password_reset", sa.Boolean),
        )
        bind.execute(
            staff_users.insert().values(
                username="admin",
                display_name="超级管理员",
                password_hash=value,
                role="super_admin",
                status="active",
                token_version=1,
                force_password_reset=True,
            )
        )
    bind.execute(settings_table.delete().where(settings_table.c.key == "admin_password"))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "staff_users" not in tables:
        op.create_table(
            "staff_users",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("username", sa.String(50), nullable=False),
            sa.Column("display_name", sa.String(100), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("force_password_reset", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.Column("created_by_staff_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["created_by_staff_id"], ["staff_users.id"]),
            sa.UniqueConstraint("username", name="ux_staff_users_username"),
            sa.CheckConstraint(
                "role IN ('super_admin', 'operator', 'support')",
                name="ck_staff_users_role",
            ),
            sa.CheckConstraint(
                "status IN ('active', 'disabled')",
                name="ck_staff_users_status",
            ),
            sa.CheckConstraint("token_version >= 1", name="ck_staff_users_token_version"),
        )
        op.create_index("ix_staff_users_username", "staff_users", ["username"])
        op.create_index("ix_staff_users_role", "staff_users", ["role"])
        op.create_index("ix_staff_users_status", "staff_users", ["status"])
        op.create_index("ix_staff_users_role_status", "staff_users", ["role", "status"])

    inspector = sa.inspect(bind)
    if "settings" in inspector.get_table_names():
        _migrate_legacy_admin(bind)

    # The deployment runbook exports the legacy commerce tables before this
    # revision.  The old order/profit shape does not satisfy the new state
    # machine and immutable-ledger invariants, so clear children before parents
    # and let the internal seed rebuild only valid simulation data.
    if "profit_records" in tables:
        bind.execute(sa.text("DELETE FROM profit_records"))
    if "orders" in tables:
        bind.execute(sa.text("DELETE FROM orders"))

    if "plans" in inspector.get_table_names():
        bind.execute(sa.text("UPDATE plans SET status = 'archived' WHERE status = 'deleted'"))
        bind.execute(
            sa.text("UPDATE plans SET price = 0.01 WHERE price IS NULL OR price <= 0")
        )
        bind.execute(
            sa.text(
                "UPDATE plans SET duration_days = 1 "
                "WHERE duration_days IS NULL OR duration_days <= 0"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE plans SET status = 'disabled' "
                "WHERE status IS NULL "
                "OR status NOT IN ('active', 'disabled', 'archived')"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE plans SET product_type = 'consumer' "
                "WHERE product_type IS NULL "
                "OR product_type NOT IN ('consumer', 'business')"
            )
        )
        _deduplicate_plan_names(bind)
        inspector = sa.inspect(bind)
        if "ux_plans_name" not in _index_names(inspector, "plans"):
            op.create_index("ux_plans_name", "plans", ["name"], unique=True)
        _ensure_check_constraints(
            "plans",
            (
                ("ck_plans_price_positive", "price > 0"),
                ("ck_plans_duration_positive", "duration_days > 0"),
                (
                    "ck_plans_status",
                    "status IN ('active', 'disabled', 'archived')",
                ),
                (
                    "ck_plans_product_type",
                    "product_type IN ('consumer', 'business')",
                ),
            ),
        )

    if "orders" in inspector.get_table_names():
        _add_column(
            "orders",
            sa.Column("plan_name_snapshot", sa.String(100), nullable=False, server_default="未关联套餐"),
        )
        _add_column(
            "orders",
            sa.Column("plan_price_snapshot", sa.Numeric(10, 2), nullable=False, server_default="0"),
        )
        _add_column(
            "orders",
            sa.Column("plan_duration_days_snapshot", sa.Integer(), nullable=False, server_default="0"),
        )
        _add_column("orders", sa.Column("refund_reason", sa.String(500), nullable=True))
        _add_column("orders", sa.Column("cancel_reason", sa.String(500), nullable=True))
        _add_column("orders", sa.Column("refunded_at", sa.DateTime(), nullable=True))
        _add_column("orders", sa.Column("cancelled_at", sa.DateTime(), nullable=True))
        _add_column(
            "orders",
            sa.Column(
                "created_by_staff_id",
                sa.Integer(),
                sa.ForeignKey("staff_users.id"),
                nullable=True,
            ),
        )
        _add_column(
            "orders",
            sa.Column(
                "updated_by_staff_id",
                sa.Integer(),
                sa.ForeignKey("staff_users.id"),
                nullable=True,
            ),
        )
        bind.execute(
            sa.text(
                "UPDATE orders SET plan_name_snapshot = COALESCE("
                "(SELECT plans.name FROM plans WHERE plans.id = orders.plan_id), "
                "plan_name_snapshot, '未关联套餐')"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE orders SET plan_price_snapshot = COALESCE("
                "(SELECT plans.price FROM plans WHERE plans.id = orders.plan_id), "
                "amount, 0)"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE orders SET plan_duration_days_snapshot = COALESCE("
                "(SELECT plans.duration_days FROM plans WHERE plans.id = orders.plan_id), "
                "plan_duration_days_snapshot, 0)"
            )
        )
        bind.execute(
            sa.text("UPDATE orders SET amount = 0.01 WHERE amount IS NULL OR amount <= 0")
        )
        bind.execute(
            sa.text(
                "UPDATE orders SET refund_amount = 0 "
                "WHERE refund_amount IS NULL OR refund_amount < 0"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE orders SET status = 'pending' "
                "WHERE status IS NULL "
                "OR status NOT IN ('pending', 'paid', 'refunded', 'cancelled')"
            )
        )
        inspector = sa.inspect(bind)
        indexes = _index_names(inspector, "orders")
        if "ix_orders_created_by_staff_id" not in indexes:
            op.create_index(
                "ix_orders_created_by_staff_id",
                "orders",
                ["created_by_staff_id"],
            )
        _ensure_check_constraints(
            "orders",
            (
                ("ck_orders_amount_positive", "amount > 0"),
                ("ck_orders_refund_nonnegative", "refund_amount >= 0"),
                (
                    "ck_orders_status",
                    "status IN ('pending', 'paid', 'refunded', 'cancelled')",
                ),
            ),
        )

    inspector = sa.inspect(bind)
    if "profit_records" in inspector.get_table_names():
        _add_column(
            "profit_records",
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        )
        _add_column(
            "profit_records",
            sa.Column("policy_version", sa.Integer(), nullable=False, server_default="1"),
        )
        _add_column(
            "profit_records",
            sa.Column("ratios_snapshot", sa.Text(), nullable=False, server_default="{}"),
        )
        _add_column(
            "profit_records",
            sa.Column("order_amount_snapshot", sa.Numeric(10, 2), nullable=False, server_default="0"),
        )
        _add_column("profit_records", sa.Column("reversed_at", sa.DateTime(), nullable=True))
        _add_column("profit_records", sa.Column("reversal_reason", sa.String(500), nullable=True))
        _add_column(
            "profit_records",
            sa.Column(
                "created_by_staff_id",
                sa.Integer(),
                sa.ForeignKey("staff_users.id"),
                nullable=True,
            ),
        )
        bind.execute(
            sa.text(
                "UPDATE profit_records SET order_amount_snapshot = COALESCE("
                "(SELECT orders.amount FROM orders WHERE orders.id = profit_records.order_id), 0)"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE profit_records SET status = 'active' "
                "WHERE status IS NULL OR status NOT IN ('active', 'reversed')"
            )
        )
        bind.execute(
            sa.text(
                "UPDATE profit_records SET order_amount_snapshot = 0 "
                "WHERE order_amount_snapshot IS NULL OR order_amount_snapshot < 0"
            )
        )
        _deduplicate_profit_records(bind)
        with op.batch_alter_table("profit_records") as batch_op:
            batch_op.alter_column(
                "order_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
        inspector = sa.inspect(bind)
        if "ux_profit_records_order_id" not in _index_names(inspector, "profit_records"):
            op.create_index(
                "ux_profit_records_order_id",
                "profit_records",
                ["order_id"],
                unique=True,
            )
        if "ix_profit_status_created" not in _index_names(inspector, "profit_records"):
            op.create_index(
                "ix_profit_status_created",
                "profit_records",
                ["status", "created_at"],
            )
        _ensure_check_constraints(
            "profit_records",
            (
                (
                    "ck_profit_records_status",
                    "status IN ('active', 'reversed')",
                ),
                (
                    "ck_profit_order_amount_nonnegative",
                    "order_amount_snapshot >= 0",
                ),
            ),
        )


def downgrade() -> None:
    # Preserve staff identities, order snapshots and accounting history.
    pass
