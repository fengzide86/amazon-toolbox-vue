"""
知识库 API 测试
"""
import pytest

from models import KnowledgeBase


class TestKnowledgeAPI:
    """知识库 API 测试"""

    @pytest.mark.asyncio
    async def test_get_knowledge_list(self, client, db_session, admin_token):
        """测试获取知识库列表"""
        knowledge = KnowledgeBase(
            title="测试知识",
            content="知识内容",
            category="安装教程"
        )
        db_session.add(knowledge)
        await db_session.commit()

        response = await client.get(
            "/api/knowledge",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_knowledge_categories(self, client, db_session, admin_token):
        """测试获取知识分类"""
        response = await client.get(
            "/api/knowledge/categories",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_search_knowledge(self, client, db_session, admin_token):
        """测试搜索知识"""
        knowledge = KnowledgeBase(
            title="Python 教程",
            content="Python 编程入门",
            category="使用教程"
        )
        db_session.add(knowledge)
        await db_session.commit()

        response = await client.get(
            "/api/knowledge?keyword=Python",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_nonexistent_knowledge(self, client, admin_token):
        """测试获取不存在的知识"""
        response = await client.get(
            "/api/knowledge/99999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_knowledge_requires_admin(self, client):
        """测试知识库需要管理员权限"""
        response = await client.get("/api/knowledge")
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("path", ["/api/knowledge/retrieval-test", "/api/knowledge/sync-vector"])
    async def test_rules_mode_disables_vector_endpoints(self, client, admin_token, path):
        payload = {"query": "测试"} if path.endswith("retrieval-test") else None
        response = await client.post(
            path,
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "FEATURE_DISABLED"
