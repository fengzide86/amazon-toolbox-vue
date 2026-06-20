"""
知识库服务测试
"""
import pytest
from unittest.mock import patch, AsyncMock
from services import knowledge_service


class TestKnowledgeService:
    """知识库服务测试"""

    @pytest.mark.asyncio
    async def test_get_list_empty(self, db_session):
        """测试获取空列表"""
        result = await knowledge_service.get_list(db_session)
        assert result["items"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_create_knowledge(self, db_session):
        """测试创建知识条目"""
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                
                result = await knowledge_service.create(
                    db_session,
                    category="安装教程",
                    title="如何安装工具箱",
                    content="安装步骤...",
                    keywords=["安装", "工具箱"],
                    priority="high"
                )
                
                assert result["title"] == "如何安装工具箱"
                assert result["category"] == "安装教程"
                assert result["priority"] == "high"

    @pytest.mark.asyncio
    async def test_get_list_with_filter(self, db_session):
        """测试带筛选条件获取列表"""
        # 先创建一些测试数据
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                
                await knowledge_service.create(
                    db_session,
                    category="安装教程",
                    title="测试1",
                    content="内容1"
                )
                await knowledge_service.create(
                    db_session,
                    category="报错处理",
                    title="测试2",
                    content="内容2"
                )
        
        # 按分类筛选
        result = await knowledge_service.get_list(db_session, category="安装教程")
        assert len(result["items"]) == 1
        assert result["items"][0]["category"] == "安装教程"

    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        """测试获取分类列表"""
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                
                await knowledge_service.create(
                    db_session,
                    category="安装教程",
                    title="测试1",
                    content="内容1"
                )
                await knowledge_service.create(
                    db_session,
                    category="安装教程",
                    title="测试2",
                    content="内容2"
                )
                await knowledge_service.create(
                    db_session,
                    category="报错处理",
                    title="测试3",
                    content="内容3"
                )
        
        categories = await knowledge_service.get_categories(db_session)
        assert len(categories) == 2
        category_names = [c["name"] for c in categories]
        assert "安装教程" in category_names
        assert "报错处理" in category_names

    @pytest.mark.asyncio
    async def test_delete_knowledge(self, db_session):
        """测试删除知识条目"""
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                mock_vs.delete_knowledge = AsyncMock(return_value=True)
                
                # 创建
                result = await knowledge_service.create(
                    db_session,
                    category="测试",
                    title="测试删除",
                    content="内容"
                )
                knowledge_id = result["id"]
                
                # 删除
                success = await knowledge_service.delete(db_session, knowledge_id)
                assert success is True
                
                # 验证已删除
                item = await knowledge_service.get_by_id(db_session, knowledge_id)
                assert item is None

    @pytest.mark.asyncio
    async def test_batch_import(self, db_session):
        """测试批量导入"""
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                
                items = [
                    {"category": "测试", "title": "条目1", "content": "内容1"},
                    {"category": "测试", "title": "条目2", "content": "内容2"},
                ]
                
                result = await knowledge_service.batch_import(db_session, items)
                assert result["success"] == 2
                assert result["failed"] == 0

    @pytest.mark.asyncio
    async def test_get_stats(self, db_session):
        """测试获取统计信息"""
        with patch('services.knowledge_service.ai_provider') as mock_ai:
            mock_ai.get_embedding = AsyncMock(return_value=[0.1, 0.2, 0.3])
            with patch('services.knowledge_service.vector_store') as mock_vs:
                mock_vs.add_knowledge = AsyncMock(return_value="knowledge_1")
                mock_vs.get_stats = AsyncMock(return_value={"total_vectors": 0, "status": "ok"})
                
                await knowledge_service.create(
                    db_session,
                    category="测试",
                    title="测试统计",
                    content="内容"
                )
                
                stats = await knowledge_service.get_stats(db_session)
                assert stats["total"] >= 1
                assert stats["active"] >= 1
