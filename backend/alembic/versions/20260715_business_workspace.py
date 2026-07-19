"""add C/B product entitlements and automation batch summaries

Revision ID: 20260715_business_workspace
Revises:
Create Date: 2026-07-15
"""
import sqlalchemy as sa

from alembic import op
from models import Base

revision = "20260715_business_workspace"
down_revision = None
branch_labels = None
depends_on = None


def _columns(inspector, table):
    return {column["name"] for column in inspector.get_columns(table)} if table in inspector.get_table_names() else set()


def upgrade():
    bind = op.get_bind()
    # This repository historically created its core schema at application
    # startup. Converge a fresh database into Alembic ownership before applying
    # the additive migrations below; existing tables are left untouched.
    Base.metadata.create_all(bind=bind, checkfirst=True)
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "plans" in tables:
        columns = _columns(inspector, "plans")
        if "product_type" not in columns:
            op.add_column("plans", sa.Column("product_type", sa.String(20), nullable=False, server_default="consumer"))
        if "entitlements" not in columns:
            op.add_column("plans", sa.Column("entitlements", sa.Text(), nullable=False, server_default="{}"))

    if "launch_tokens" in tables:
        columns = _columns(inspector, "launch_tokens")
        additions = [
            ("execution_mode", sa.Column("execution_mode", sa.String(20), nullable=False, server_default="single")),
            ("client_batch_id", sa.Column("client_batch_id", sa.String(100), nullable=True)),
            ("client_item_id", sa.Column("client_item_id", sa.String(100), nullable=True)),
            ("idempotency_key", sa.Column("idempotency_key", sa.String(200), nullable=True)),
        ]
        for name, column in additions:
            if name not in columns:
                op.add_column("launch_tokens", column)

    if "automation_batches" not in tables:
        op.create_table(
            "automation_batches",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("client_batch_id", sa.String(100), nullable=False, unique=True),
            sa.Column("auth_code_id", sa.Integer(), sa.ForeignKey("auth_codes.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("device_id", sa.String(200), nullable=False),
            sa.Column("tool_id", sa.String(100), nullable=False),
            sa.Column("tool_name", sa.String(200), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="running"),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("pending_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("running_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("waiting_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("started_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("last_heartbeat_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_automation_batches_owner_status", "automation_batches", ["auth_code_id", "device_id", "status"])
        op.create_index("ix_automation_batches_status_heartbeat", "automation_batches", ["status", "last_heartbeat_at"])

    inspector = sa.inspect(bind)
    if "automation_batch_items" not in inspector.get_table_names():
        op.create_table(
            "automation_batch_items",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey("automation_batches.id"), nullable=False),
            sa.Column("client_item_id", sa.String(100), nullable=False),
            sa.Column("account_label_masked", sa.String(200), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("intervention_type", sa.String(40), nullable=True),
            sa.Column("customer_message", sa.String(500), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ux_automation_batch_item_client", "automation_batch_items", ["batch_id", "client_item_id"], unique=True)
        op.create_index("ix_automation_batch_items_status_updated", "automation_batch_items", ["status", "updated_at"])

    op.execute("UPDATE plans SET product_type = 'consumer' WHERE product_type IS NULL OR product_type = ''")
    op.execute("UPDATE plans SET entitlements = '{}' WHERE entitlements IS NULL OR entitlements = ''")


def downgrade():
    # 客户端可能回滚而数据库已经包含批次审计数据；保留新增表和字段，避免破坏性回滚。
    pass
