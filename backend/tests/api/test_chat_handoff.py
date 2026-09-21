"""A rules conversation hands off to one correctly scoped support ticket."""

import pytest
from sqlalchemy import func, select

from core.dependencies import get_current_user
from main import app
from models import ChatSession, Feedback, User


@pytest.mark.asyncio
async def test_chat_transfer_rejects_replay_and_keeps_session_scope(client, db_session):
    owner = User(name="Handoff owner", is_active=True)
    db_session.add(owner)
    await db_session.commit()

    async def current_owner():
        return {"user_id": owner.id, "role": "user"}

    app.dependency_overrides[get_current_user] = current_owner
    created = await client.post("/api/ai-chat/session", json={
        "platform_key": "amazon", "capability_key": "logistics_template",
    })
    assert created.status_code == 200, created.text
    session_id = created.json()["session_id"]
    empty = await client.post(f"/api/ai-chat/session/{session_id}/transfer")
    assert empty.status_code == 422, empty.text
    first = await client.post(f"/api/ai-chat/session/{session_id}/transfer", json={"summary": "物流模板保存失败，请协助"})
    assert first.status_code == 200, first.text
    repeated = await client.post(f"/api/ai-chat/session/{session_id}/transfer")
    assert repeated.status_code == 409, repeated.text
    assert (await db_session.execute(select(func.count(Feedback.id)))).scalar_one() == 1
    ticket = (await db_session.execute(select(Feedback))).scalar_one()
    assert ticket.id == first.json()["feedback_id"]
    assert ticket.user_id == owner.id
    assert ticket.title == "人工支持 · 物流模板保存失败，请协助"
    assert session_id not in ticket.title
    assert (ticket.platform_key, ticket.capability_key) == ("amazon", "logistics_template")
    conversation = (await db_session.execute(select(ChatSession))).scalar_one()
    assert conversation.status == "transferred"
    assert conversation.transferred_to_human is True


@pytest.mark.asyncio
async def test_chat_transfer_commit_failure_does_not_leave_ticket_or_terminal_session(db_session, monkeypatch):
    from domains.knowledge import chat_service

    session = ChatSession(session_id="failed-handoff", status="active", transferred_to_human=False)
    db_session.add(session)
    await db_session.commit()

    async def fail_commit():
        await db_session.flush()
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        await chat_service.transfer_to_human(db_session, "failed-handoff", summary="保存失败")
    await db_session.refresh(session)
    assert session.status == "active"
    assert session.transferred_to_human is False
    assert (await db_session.execute(select(func.count(Feedback.id)))).scalar_one() == 0
