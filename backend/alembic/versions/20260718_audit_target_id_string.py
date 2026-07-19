"""store string identifiers in audit log targets

Revision ID: 20260718_audit_target_id_string
Revises: 20260718_demo_execution
Create Date: 2026-07-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260718_audit_target_id_string"
down_revision = "20260718_demo_execution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "audit_logs" not in inspector.get_table_names():
        return

    columns = {column["name"]: column for column in inspector.get_columns("audit_logs")}
    target_id = columns.get("target_id")
    if target_id is None or isinstance(target_id["type"], sa.String):
        return

    with op.batch_alter_table("audit_logs") as batch_op:
        batch_op.alter_column(
            "target_id",
            existing_type=target_id["type"],
            type_=sa.String(length=100),
            existing_nullable=bool(target_id.get("nullable", True)),
        )


def downgrade() -> None:
    # String target identifiers (for example release versions) cannot be safely
    # converted back to integers without losing audit history.
    pass
