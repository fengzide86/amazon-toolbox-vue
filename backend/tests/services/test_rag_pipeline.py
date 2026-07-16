import pytest
from unittest.mock import AsyncMock, patch
from sqlalchemy import func, select

from core.security import create_access_token
from models import ChatSession, Feedback, KnowledgeBase, User
from domains.knowledge import chat_service as ai_chat_service, faq_service


@pytest.mark.asyncio
async def test_faq_hit_skips_embedding_and_model(db_session):
    db_session.add(KnowledgeBase(
        category="安装教程", title="如何安装工具箱", content="下载安装包后运行。",
        keywords='["安装", "安装包"]', status="active", platform_key="amazon",
    ))
    await db_session.commit()

    with patch("domains.knowledge.chat_service.ai_provider.get_embedding", new=AsyncMock()) as embedding, \
         patch("domains.knowledge.chat_service.ai_provider.chat_completion", new=AsyncMock()) as chat:
        result = await ai_chat_service.answer_question(db_session, "工具箱如何安装？", "amazon")

    assert result["answer_mode"] == "faq"
    assert result["ai_used"] is False
    assert result["knowledge_refs"][0]["title"] == "如何安装工具箱"
    embedding.assert_not_awaited()
    chat.assert_not_awaited()


@pytest.mark.asyncio
async def test_rag_miss_calls_embedding_and_model_once(db_session):
    with patch("domains.knowledge.chat_service.ai_provider.has_api_key", return_value=True), \
         patch("domains.knowledge.chat_service.ai_provider.get_embedding", new=AsyncMock(return_value=[0.1, 0.2])) as embedding, \
         patch("domains.knowledge.chat_service.vector_store.search_knowledge", new=AsyncMock(return_value=[])) as search, \
         patch("domains.knowledge.chat_service.ai_provider.chat_completion", new=AsyncMock(return_value="AI 回答")) as chat:
        result = await ai_chat_service.answer_question(db_session, "一个未收录的问题", "amazon")

    assert result["answer_mode"] == "rag"
    assert result["reply"] == "AI 回答"
    embedding.assert_awaited_once()
    search.assert_awaited_once()
    chat.assert_awaited_once()


@pytest.mark.asyncio
async def test_faq_platform_isolation(db_session):
    db_session.add_all([
        KnowledgeBase(category="使用教程", title="发货设置", content="亚马逊答案", keywords='["发货"]', status="active", platform_key="amazon"),
        KnowledgeBase(category="使用教程", title="发货设置", content="速卖通答案", keywords='["发货"]', status="active", platform_key="aliexpress"),
    ])
    await db_session.commit()

    result = await faq_service.match_faq(db_session, "发货怎么设置", "aliexpress")
    assert result["content"] == "速卖通答案"


@pytest.mark.asyncio
async def test_admin_debug_does_not_create_session(client, db_session, admin_token):
    before = (await db_session.execute(select(func.count(ChatSession.id)))).scalar() or 0
    fake = {
        "reply": "测试", "answer_mode": "faq", "ai_used": False,
        "knowledge_refs": [], "fallback_reason": None, "diagnostics": {"total_ms": 1},
    }
    with patch("domains.knowledge.chat_service.answer_question", new=AsyncMock(return_value=fake)):
        response = await client.post(
            "/api/ai-chat/admin/debug", json={"message": "测试"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    after = (await db_session.execute(select(func.count(ChatSession.id)))).scalar() or 0
    assert response.status_code == 200
    assert before == after


@pytest.mark.asyncio
async def test_user_cannot_read_another_users_session(client, db_session):
    owner = User(name="owner", auth_code_id=1)
    other = User(name="other", auth_code_id=2)
    db_session.add_all([owner, other])
    await db_session.commit()
    await db_session.refresh(owner)
    await db_session.refresh(other)
    session = await ai_chat_service.create_session(db_session, owner.id)
    token = create_access_token({"user_id": other.id, "role": "user", "auth_code_id": 2})

    response = await client.get(
        f"/api/ai-chat/session/{session['session_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_invalid_transfer_does_not_create_feedback(db_session):
    result = await ai_chat_service.transfer_to_human(db_session, "missing-session", user_id=1)
    count = (await db_session.execute(select(func.count(Feedback.id)))).scalar() or 0
    assert result is None
    assert count == 0


@pytest.mark.asyncio
async def test_knowledge_create_and_delete_api(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    created = await client.post("/api/knowledge", json={
        "category": "测试", "title": "可删除知识", "content": "测试内容",
        "platform_key": "amazon", "keywords": ["测试"],
    }, headers=headers)
    assert created.status_code == 200
    knowledge_id = created.json()["id"]

    deleted = await client.delete(f"/api/knowledge/{knowledge_id}", headers=headers)
    assert deleted.status_code == 200
