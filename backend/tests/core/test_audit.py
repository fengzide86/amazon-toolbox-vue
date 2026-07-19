from unittest.mock import AsyncMock, MagicMock

import pytest

from core.audit import log_admin_action
from models import AuditLog


@pytest.mark.asyncio
async def test_audit_is_flushed_but_never_commits_its_own_transaction():
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()

    await log_admin_action(
        db,
        user_id=7,
        user_name="operator",
        action="setting_update",
        target_type="setting",
        target_id="system_name",
        detail={"role": "operator", "before": None, "after": {"value": "internal"}},
    )

    audit = db.add.call_args.args[0]
    assert isinstance(audit, AuditLog)
    assert audit.user_id == 7
    db.flush.assert_awaited_once()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_audit_failure_propagates_to_abort_the_business_transaction():
    db = MagicMock()
    db.flush = AsyncMock(side_effect=RuntimeError("audit unavailable"))

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await log_admin_action(db, action="user_update")
