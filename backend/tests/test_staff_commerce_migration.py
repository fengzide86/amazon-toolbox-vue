import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from core.security import hash_password


def test_staff_commerce_migration_upgrades_legacy_sqlite(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy.db"
    engine = sa.create_engine(f"sqlite:///{database_path}")
    metadata = sa.MetaData()
    settings = sa.Table(
        "settings",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False),
        sa.Column("value", sa.Text),
    )
    plans = sa.Table(
        "plans",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("duration_days", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("product_type", sa.String(20), nullable=False, server_default="consumer"),
    )
    orders = sa.Table(
        "orders",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_no", sa.String(100), unique=True, nullable=False),
        sa.Column("plan_id", sa.Integer),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("refund_amount", sa.Numeric(10, 2), server_default="0"),
        sa.Column("platform_key", sa.String(50)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )
    profits = sa.Table(
        "profit_records",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, nullable=True),
        sa.Column("tech_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("market_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("product_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("service_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("coordination_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("record_share", sa.Numeric(10, 2), server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            settings.insert(),
            {"key": "admin_password", "value": hash_password("Legacy-admin-123")},
        )
        connection.execute(
            plans.insert(),
            [
                {"id": 1, "name": "旧套餐", "price": 99, "duration_days": 30, "status": "deleted"},
                {"id": 2, "name": "旧套餐", "price": 199, "duration_days": 60, "status": "active"},
            ],
        )
        connection.execute(
            sa.text(
                "UPDATE plans SET price = 0, duration_days = 0, "
                "product_type = 'legacy' WHERE id = 1"
            )
        )
        connection.execute(
            orders.insert(),
            {"id": 1, "order_no": "LEGACY-ORDER", "plan_id": 2, "amount": 199, "status": "paid"},
        )
        connection.execute(
            profits.insert(),
            {
                "id": 1,
                "order_id": 1,
                "tech_share": 59.7,
                "market_share": 49.75,
                "product_share": 29.85,
                "service_share": 29.85,
                "coordination_share": 19.9,
                "record_share": 9.95,
            },
        )

    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "20260718_staff_commerce.py"
    spec = importlib.util.spec_from_file_location("staff_commerce_migration", migration_path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()
        # The revision is deliberately safe to retry after a partially
        # completed internal deployment.
        migration.upgrade()

    inspector = sa.inspect(engine)
    assert "staff_users" in inspector.get_table_names()
    assert {
        constraint["name"] for constraint in inspector.get_check_constraints("plans")
    } >= {
        "ck_plans_price_positive",
        "ck_plans_duration_positive",
        "ck_plans_status",
        "ck_plans_product_type",
    }
    assert {
        constraint["name"] for constraint in inspector.get_check_constraints("orders")
    } >= {
        "ck_orders_amount_positive",
        "ck_orders_refund_nonnegative",
        "ck_orders_status",
    }
    assert {
        constraint["name"]
        for constraint in inspector.get_check_constraints("profit_records")
    } >= {
        "ck_profit_records_status",
        "ck_profit_order_amount_nonnegative",
    }
    assert {column["name"] for column in inspector.get_columns("orders")} >= {
        "plan_name_snapshot",
        "plan_price_snapshot",
        "refunded_at",
        "cancelled_at",
    }
    assert {column["name"] for column in inspector.get_columns("profit_records")} >= {
        "status",
        "policy_version",
        "ratios_snapshot",
        "order_amount_snapshot",
        "reversed_at",
    }
    order_id_column = next(
        column for column in inspector.get_columns("profit_records") if column["name"] == "order_id"
    )
    assert order_id_column["nullable"] is False

    with engine.connect() as connection:
        assert connection.execute(
            sa.text("SELECT COUNT(*) FROM settings WHERE key = 'admin_password'")
        ).scalar_one() == 0
        staff = connection.execute(
            sa.text("SELECT username, role, force_password_reset FROM staff_users")
        ).one()
        assert tuple(staff) == ("admin", "super_admin", 1)
        assert connection.execute(
            sa.text("SELECT status FROM plans WHERE id = 1")
        ).scalar_one() == "archived"
        normalized_plan = connection.execute(
            sa.text(
                "SELECT price, duration_days, product_type FROM plans WHERE id = 1"
            )
        ).one()
        assert float(normalized_plan.price) == 0.01
        assert normalized_plan.duration_days == 1
        assert normalized_plan.product_type == "consumer"
        assert connection.execute(
            sa.text("SELECT COUNT(DISTINCT name) FROM plans")
        ).scalar_one() == 2
        assert connection.execute(sa.text("SELECT COUNT(*) FROM orders")).scalar_one() == 0
        assert connection.execute(
            sa.text("SELECT COUNT(*) FROM profit_records")
        ).scalar_one() == 0
