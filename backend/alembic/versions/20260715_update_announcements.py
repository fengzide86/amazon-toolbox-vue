"""add targeted announcements and per-device receipts

Revision ID: 20260715_update_announcements
Revises: 20260715_business_workspace
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260715_update_announcements"
down_revision = "20260715_business_workspace"
branch_labels = None
depends_on = None


def _columns(inspector, table):
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "announcements" in tables:
        columns = _columns(inspector, "announcements")
        additions = [
            ("audience", sa.Column("audience", sa.String(20), nullable=False, server_default="all")),
            ("category", sa.Column("category", sa.String(20), nullable=False, server_default="system")),
            ("severity", sa.Column("severity", sa.String(20), nullable=False, server_default="info")),
            ("presentation", sa.Column("presentation", sa.String(20), nullable=False, server_default="banner")),
            ("app_version", sa.Column("app_version", sa.String(50), nullable=True)),
            ("starts_at", sa.Column("starts_at", sa.DateTime(), nullable=True)),
            ("published_at", sa.Column("published_at", sa.DateTime(), nullable=True)),
            ("revision", sa.Column("revision", sa.Integer(), nullable=False, server_default="1")),
        ]
        for name, column in additions:
            if name not in columns:
                op.add_column("announcements", column)

        op.execute("""
            UPDATE announcements SET
                category = CASE
                    WHEN type IN ('system', 'maintenance', 'update', 'activity') THEN type
                    ELSE 'system'
                END,
                severity = CASE
                    WHEN type = 'maintenance' THEN 'critical'
                    WHEN type = 'system' THEN 'important'
                    ELSE 'info'
                END,
                presentation = CASE
                    WHEN type IN ('system', 'maintenance') THEN 'modal'
                    ELSE 'banner'
                END,
                audience = COALESCE(audience, 'all'),
                revision = COALESCE(revision, 1),
                published_at = CASE
                    WHEN status = 'published' THEN COALESCE(published_at, created_at)
                    ELSE published_at
                END
        """)

    inspector = sa.inspect(bind)
    if "announcement_receipts" not in inspector.get_table_names():
        op.create_table(
            "announcement_receipts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("announcement_id", sa.Integer(), sa.ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("auth_code_id", sa.Integer(), sa.ForeignKey("auth_codes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("device_id", sa.String(200), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("dismissed_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint(
                "announcement_id", "auth_code_id", "device_id", "revision",
                name="ux_announcement_receipt_scope",
            ),
        )
        op.create_index("ix_announcement_receipts_announcement_id", "announcement_receipts", ["announcement_id"])
        op.create_index("ix_announcement_receipts_auth_code_id", "announcement_receipts", ["auth_code_id"])


def downgrade():
    # 回滚旧客户端时保留定向字段和阅读回执，避免未读状态丢失。
    pass
