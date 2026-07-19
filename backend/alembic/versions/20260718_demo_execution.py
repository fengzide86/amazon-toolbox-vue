"""add isolated demo records and verified execution boundary

Revision ID: 20260718_demo_execution
Revises: 20260718_staff_commerce
Create Date: 2026-07-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260718_demo_execution"
down_revision = "20260718_staff_commerce"
branch_labels = None
depends_on = None


def _create_demo_tables(inspector: sa.Inspector) -> None:
    tables = set(inspector.get_table_names())
    if "demo_runs" not in tables:
        op.create_table(
            "demo_runs",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("idempotency_key", sa.String(120), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("auth_code_id", sa.Integer(), sa.ForeignKey("auth_codes.id"), nullable=True),
            sa.Column("device_id", sa.String(200), nullable=True),
            sa.Column("tool_id", sa.String(100), nullable=False),
            sa.Column("tool_name_snapshot", sa.String(200), nullable=False),
            sa.Column("platform_key", sa.String(50), nullable=False),
            sa.Column("scenario_id", sa.String(100), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="created"),
            sa.Column("event_seq", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("current_step_id", sa.String(100), nullable=True),
            sa.Column("completed_step_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_step_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("simulated_outcome", sa.String(30), nullable=True),
            sa.Column("error_code", sa.String(100), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint(
                "status IN ('created','running','paused','completed','cancelled','error')",
                name="ck_demo_runs_status",
            ),
            sa.CheckConstraint(
                "simulated_outcome IS NULL OR simulated_outcome IN "
                "('completed_example','attention_example','failure_example')",
                name="ck_demo_runs_outcome",
            ),
            sa.UniqueConstraint("user_id", "idempotency_key", name="ux_demo_run_owner_idempotency"),
        )
        op.create_index("ix_demo_runs_user_id", "demo_runs", ["user_id"])
        op.create_index("ix_demo_runs_auth_code_id", "demo_runs", ["auth_code_id"])
        op.create_index("ix_demo_runs_device_id", "demo_runs", ["device_id"])
        op.create_index("ix_demo_runs_tool_id", "demo_runs", ["tool_id"])
        op.create_index("ix_demo_runs_platform_key", "demo_runs", ["platform_key"])
        op.create_index("ix_demo_runs_status", "demo_runs", ["status"])
        op.create_index("ix_demo_runs_owner_created", "demo_runs", ["user_id", "created_at"])
        op.create_index("ix_demo_runs_owner_status", "demo_runs", ["user_id", "status"])

    inspector = sa.inspect(op.get_bind())
    if "demo_batches" not in inspector.get_table_names():
        op.create_table(
            "demo_batches",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("idempotency_key", sa.String(120), nullable=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("auth_code_id", sa.Integer(), sa.ForeignKey("auth_codes.id"), nullable=True),
            sa.Column("device_id", sa.String(200), nullable=True),
            sa.Column("tool_id", sa.String(100), nullable=False),
            sa.Column("tool_name_snapshot", sa.String(200), nullable=False),
            sa.Column("platform_key", sa.String(50), nullable=False),
            sa.Column("scenario_id", sa.String(100), nullable=False),
            sa.Column("row_count", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="created"),
            sa.Column("event_seq", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("queued_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("playing_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("played_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint(
                "status IN ('created','running','completed','cancelled','error')",
                name="ck_demo_batches_status",
            ),
            sa.CheckConstraint("row_count > 0", name="ck_demo_batches_row_count"),
            sa.UniqueConstraint("user_id", "idempotency_key", name="ux_demo_batch_owner_idempotency"),
        )
        op.create_index("ix_demo_batches_user_id", "demo_batches", ["user_id"])
        op.create_index("ix_demo_batches_auth_code_id", "demo_batches", ["auth_code_id"])
        op.create_index("ix_demo_batches_device_id", "demo_batches", ["device_id"])
        op.create_index("ix_demo_batches_tool_id", "demo_batches", ["tool_id"])
        op.create_index("ix_demo_batches_platform_key", "demo_batches", ["platform_key"])
        op.create_index("ix_demo_batches_status", "demo_batches", ["status"])
        op.create_index("ix_demo_batches_owner_created", "demo_batches", ["user_id", "created_at"])
        op.create_index("ix_demo_batches_owner_status", "demo_batches", ["user_id", "status"])

    inspector = sa.inspect(op.get_bind())
    if "demo_batch_items" not in inspector.get_table_names():
        op.create_table(
            "demo_batch_items",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "batch_id",
                sa.String(64),
                sa.ForeignKey("demo_batches.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("item_ref", sa.String(64), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
            sa.Column("simulated_outcome", sa.String(30), nullable=True),
            sa.Column("event_seq", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.CheckConstraint(
                "status IN ('queued','playing','played','skipped','error')",
                name="ck_demo_batch_items_status",
            ),
            sa.CheckConstraint(
                "simulated_outcome IS NULL OR simulated_outcome IN "
                "('completed_example','attention_example','failure_example')",
                name="ck_demo_batch_items_outcome",
            ),
            sa.UniqueConstraint("batch_id", "item_ref", name="ux_demo_batch_item_ref"),
        )
        op.create_index("ix_demo_batch_items_batch_id", "demo_batch_items", ["batch_id"])
        op.create_index("ix_demo_batch_items_status", "demo_batch_items", ["status"])
        op.create_index("ix_demo_batch_items_batch_status", "demo_batch_items", ["batch_id", "status"])


def _mark_legacy_and_migrate_mock_logs(bind) -> None:
    inspector = sa.inspect(bind)
    if "run_logs" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("run_logs")}
    if "verification_state" not in columns:
        op.add_column(
            "run_logs",
            sa.Column(
                "verification_state",
                sa.String(30),
                nullable=False,
                server_default="legacy_unverified",
            ),
        )
        op.create_index("ix_run_logs_verification_state", "run_logs", ["verification_state"])
    op.execute("UPDATE run_logs SET verification_state = 'legacy_unverified'")

    metadata = sa.MetaData()
    run_logs = sa.Table("run_logs", metadata, autoload_with=bind)
    demo_runs = sa.Table("demo_runs", metadata, autoload_with=bind)
    mock_markers = []
    if "tool_id" in run_logs.c:
        mock_markers.append(run_logs.c.tool_id.like("mock_run_%"))
    if "script_key" in run_logs.c:
        mock_markers.append(run_logs.c.script_key.like("mock_run_%"))
    if not mock_markers:
        return
    mock_condition = sa.or_(*mock_markers)
    legacy_rows = bind.execute(
        sa.select(run_logs).where(run_logs.c.user_id.is_not(None), mock_condition)
    ).mappings()
    for row in legacy_rows:
        identifier = f"legacy_mock_run_{row['id']}"
        exists = bind.execute(sa.select(demo_runs.c.id).where(demo_runs.c.id == identifier)).first()
        if exists:
            continue
        completed = row.get("status") == "success"
        bind.execute(
            demo_runs.insert().values(
                id=identifier,
                user_id=row["user_id"],
                auth_code_id=row.get("auth_code_id"),
                device_id=row.get("device_id"),
                tool_id=row.get("tool_id") or "legacy_mock",
                tool_name_snapshot=row.get("tool_name") or "历史演示",
                platform_key=row.get("platform_key") or "amazon",
                scenario_id="legacy_mock_migrated",
                status="completed" if completed else "error",
                event_seq=1,
                completed_step_count=1 if completed else 0,
                total_step_count=1,
                simulated_outcome="completed_example" if completed else "failure_example",
                error_code=None if completed else (row.get("error_code") or "LEGACY_MOCK_ERROR"),
                started_at=row.get("created_at"),
                finished_at=row.get("created_at"),
                created_at=row.get("created_at"),
                updated_at=row.get("created_at"),
            )
        )


def upgrade() -> None:
    bind = op.get_bind()
    _create_demo_tables(sa.inspect(bind))
    _mark_legacy_and_migrate_mock_logs(bind)


def downgrade() -> None:
    # 演示和历史核验数据属于审计记录，不做破坏性回退。
    pass
