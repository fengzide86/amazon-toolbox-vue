"""Rule-mode knowledge service tests."""
import pytest

from domains.knowledge import service as knowledge_service


class TestKnowledgeService:
    @pytest.mark.asyncio
    async def test_get_list_empty(self, db_session):
        result = await knowledge_service.get_list(db_session)
        assert result["items"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_create_knowledge_does_not_create_vector(self, db_session):
        result = await knowledge_service.create(
            db_session,
            category="安装教程",
            title="如何安装工具箱",
            content="安装步骤...",
            keywords=["安装", "工具箱"],
            priority="high",
        )
        assert result["title"] == "如何安装工具箱"
        assert result["priority"] == "high"
        assert result["vector_id"] is None

    @pytest.mark.asyncio
    async def test_get_list_with_filter(self, db_session):
        await knowledge_service.create(db_session, category="安装教程", title="测试1", content="内容1")
        await knowledge_service.create(db_session, category="报错处理", title="测试2", content="内容2")

        result = await knowledge_service.get_list(db_session, category="安装教程")
        assert len(result["items"]) == 1
        assert result["items"][0]["category"] == "安装教程"

    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        await knowledge_service.create(db_session, category="安装教程", title="测试1", content="内容1")
        await knowledge_service.create(db_session, category="安装教程", title="测试2", content="内容2")
        await knowledge_service.create(db_session, category="报错处理", title="测试3", content="内容3")

        categories = await knowledge_service.get_categories(db_session)
        assert {item["name"] for item in categories} == {"安装教程", "报错处理"}

    @pytest.mark.asyncio
    async def test_delete_knowledge(self, db_session):
        result = await knowledge_service.create(db_session, category="测试", title="测试删除", content="内容")
        assert await knowledge_service.delete(db_session, result["id"]) is True
        assert await knowledge_service.get_by_id(db_session, result["id"]) is None

    @pytest.mark.asyncio
    async def test_batch_import(self, db_session):
        result = await knowledge_service.batch_import(db_session, [
            {"category": "测试", "title": "条目1", "content": "内容1"},
            {"category": "测试", "title": "条目2", "content": "内容2"},
        ])
        assert result["success"] == 2
        assert result["failed"] == 0

    @pytest.mark.asyncio
    async def test_get_stats_reports_rules_mode(self, db_session):
        await knowledge_service.create(db_session, category="测试", title="测试统计", content="内容")
        stats = await knowledge_service.get_stats(db_session)
        assert stats["active"] == 1
        assert stats["vector_store"] == {"enabled": False, "reason": "rules_mode"}

    @pytest.mark.asyncio
    async def test_vector_sync_is_disabled(self, db_session):
        with pytest.raises(RuntimeError, match="FEATURE_DISABLED"):
            await knowledge_service.sync_all_to_vector(db_session)
