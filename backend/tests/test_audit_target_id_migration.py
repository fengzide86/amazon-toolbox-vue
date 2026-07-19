import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

from database import SCHEMA_REVISION


def test_runtime_schema_gate_matches_alembic_head():
    backend_dir = Path(__file__).parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    assert ScriptDirectory.from_config(config).get_current_head() == SCHEMA_REVISION


def test_audit_target_id_migration_accepts_release_versions(tmp_path, monkeypatch):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    metadata = sa.MetaData()
    audit_logs = sa.Table(
        "audit_logs",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("target_id", sa.Integer, nullable=True),
    )
    metadata.create_all(engine)

    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "20260718_audit_target_id_string.py"
    )
    spec = importlib.util.spec_from_file_location("audit_target_id_migration", migration_path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    with engine.begin() as connection:
        connection.execute(audit_logs.insert().values(target_id=7))
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))
        migration.upgrade()

        migrated = sa.Table("audit_logs", sa.MetaData(), autoload_with=connection)
        assert isinstance(migrated.c.target_id.type, sa.String)
        connection.execute(migrated.insert().values(target_id="1.7.8"))
        assert connection.execute(
            sa.select(migrated.c.target_id).order_by(migrated.c.id)
        ).scalars().all() == ["7", "1.7.8"]
