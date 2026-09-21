"""Exercise a legacy SQLite schema upgrade/downgrade without changing real data."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory


def load_migration(connection: sa.Connection):
    path = Path(__file__).parents[1] / "alembic" / "versions" / "20260921_agency_workspace.py"
    spec = importlib.util.spec_from_file_location("agency_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    migration.op = Operations(MigrationContext.configure(connection))
    return migration


def test_agency_upgrade_preserves_legacy_rows_and_never_assigns_them(tmp_path) -> None:
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'legacy-agency.db'}")
    with engine.begin() as connection:
        metadata = sa.MetaData()
        sa.Table("staff_users", metadata, sa.Column("id", sa.Integer, primary_key=True), sa.Column("role", sa.String(20), nullable=False), sa.CheckConstraint("role IN ('super_admin','operator','support')", name="ck_staff_users_role"))
        metadata.create_all(connection)
        connection.exec_driver_sql("CREATE TABLE orders (id INTEGER PRIMARY KEY, amount NUMERIC(10,2))")
        connection.exec_driver_sql("CREATE TABLE auth_codes (id INTEGER PRIMARY KEY, code VARCHAR(100))")
        connection.exec_driver_sql("INSERT INTO staff_users VALUES (1,'super_admin')")
        connection.exec_driver_sql("INSERT INTO orders VALUES (1,99.00)")
        connection.exec_driver_sql("INSERT INTO auth_codes VALUES (1,'OLD-CODE')")
        migration = load_migration(connection)
        migration.upgrade()
        migration.upgrade()  # safe on pre-created/latest schema as well
        assert connection.exec_driver_sql("SELECT agency_id, customer_id FROM orders").one() == (None, None)
        assert connection.exec_driver_sql("SELECT agency_id, customer_id, order_id FROM auth_codes").one() == (None, None, None)
        checks = {c["name"] for c in sa.inspect(connection).get_check_constraints("staff_users")}
        assert "ck_staff_users_agent_agency" in checks
        uniques = {c["name"] for c in sa.inspect(connection).get_unique_constraints("auth_codes")}
        assert "ux_auth_codes_order_id" in uniques
        migration.downgrade()
        assert connection.exec_driver_sql("SELECT amount FROM orders").scalar_one() == 99
        assert connection.exec_driver_sql("SELECT code FROM auth_codes").scalar_one() == "OLD-CODE"
        assert "agencies" not in sa.inspect(connection).get_table_names()


def test_agency_downgrade_refuses_to_remove_partner_history(tmp_path) -> None:
    from models import Base

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'current-agency.db'}")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("INSERT INTO agencies (name) VALUES ('Existing partner')")
        migration = load_migration(connection)
        with pytest.raises(RuntimeError, match="history exists"):
            migration.downgrade()
        assert connection.exec_driver_sql("SELECT name FROM agencies").scalar_one() == "Existing partner"


def test_all_revisions_build_fresh_database_with_agent_constraint(tmp_path) -> None:
    from alembic.config import Config

    backend = Path(__file__).parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'fresh-full-chain.db'}")
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            for revision in reversed(list(scripts.walk_revisions())):
                revision.module.upgrade()
        checks = {item["name"]: item["sqltext"] for item in sa.inspect(connection).get_check_constraints("staff_users")}
        assert "'agent'" in checks["ck_staff_users_role"]
        assert "ck_staff_users_agent_agency" in checks
        assert "agency_requests" in sa.inspect(connection).get_table_names()
