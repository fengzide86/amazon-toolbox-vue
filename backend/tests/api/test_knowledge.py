"""
知识库 API 测试
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from main import app
from database import get_db
from models import KnowledgeBase
from core.security import create_access_token


@pytest.fixture
def client(db_session: AsyncSession):
    """创建测试客户端"""
    async def override_get_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token():
    """管理员 token"""
    return create_access_token({"sub": "admin", "role": "admin"})


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

        response = client.get(
            "/api/knowledge",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_knowledge_categories(self, client, db_session, admin_token):
        """测试获取知识分类"""
        response = client.get(
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

        response = client.get(
            "/api/knowledge?keyword=Python",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_nonexistent_knowledge(self, client, admin_token):
        """测试获取不存在的知识"""
        response = client.get(
            "/api/knowledge/99999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_knowledge_requires_admin(self, client):
        """测试知识库需要管理员权限"""
        response = client.get("/api/knowledge")
        assert response.status_code in (401, 403)