"""
知识库 API 测试
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.main import app
from backend.database import get_db
from backend.models import Knowledge
from backend.core.security import create_access_token


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


@pytest.fixture
def user_token():
    """普通用户 token"""
    return create_access_token({"sub": "user1", "role": "user"})


class TestKnowledgeAPI:
    """知识库 API 测试"""

    @pytest.mark.asyncio
    async def test_get_knowledge_list(self, client, db_session):
        """测试获取知识库列表"""
        # 创建测试知识
        knowledge = Knowledge(
            title="测试知识",
            content="知识内容",
            category="general"
        )
        db_session.add(knowledge)
        await db_session.commit()

        response = client.get("/api/knowledge")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["title"] == "测试知识"

    @pytest.mark.asyncio
    async def test_get_knowledge_by_id(self, client, db_session):
        """测试根据 ID 获取知识"""
        knowledge = Knowledge(
            title="测试知识2",
            content="知识内容2",
            category="general"
        )
        db_session.add(knowledge)
        await db_session.commit()
        await db_session.refresh(knowledge)

        response = client.get(f"/api/knowledge/{knowledge.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "测试知识2"

    @pytest.mark.asyncio
    async def test_create_knowledge_admin(self, client, admin_token):
        """测试管理员创建知识"""
        response = client.post(
            "/api/knowledge",
            json={"title": "新知识", "content": "内容", "category": "general"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "新知识"

    @pytest.mark.asyncio
    async def test_create_knowledge_user_forbidden(self, client, user_token):
        """测试普通用户不能创建知识"""
        response = client.post(
            "/api/knowledge",
            json={"title": "新知识", "content": "内容", "category": "general"},
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_knowledge(self, client, db_session, admin_token):
        """测试更新知识"""
        knowledge = Knowledge(
            title="原标题",
            content="原内容",
            category="general"
        )
        db_session.add(knowledge)
        await db_session.commit()
        await db_session.refresh(knowledge)

        response = client.put(
            f"/api/knowledge/{knowledge.id}",
            json={"title": "新标题", "content": "新内容"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "新标题"

    @pytest.mark.asyncio
    async def test_delete_knowledge(self, client, db_session, admin_token):
        """测试删除知识"""
        knowledge = Knowledge(
            title="待删除知识",
            content="内容",
            category="general"
        )
        db_session.add(knowledge)
        await db_session.commit()
        await db_session.refresh(knowledge)

        response = client.delete(
            f"/api/knowledge/{knowledge.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_knowledge_categories(self, client, db_session):
        """测试获取知识分类"""
        knowledge1 = Knowledge(title="知识1", content="内容1", category="category1")
        knowledge2 = Knowledge(title="知识2", content="内容2", category="category2")
        db_session.add_all([knowledge1, knowledge2])
        await db_session.commit()

        response = client.get("/api/knowledge/categories")
        assert response.status_code == 200
        data = response.json()
        assert "category1" in data
        assert "category2" in data

    @pytest.mark.asyncio
    async def test_search_knowledge(self, client, db_session):
        """测试搜索知识"""
        knowledge = Knowledge(
            title="Python 教程",
            content="Python 编程入门",
            category="programming"
        )
        db_session.add(knowledge)
        await db_session.commit()

        response = client.get("/api/knowledge?search=Python")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert "Python" in data[0]["title"]

    @pytest.mark.asyncio
    async def test_get_nonexistent_knowledge(self, client):
        """测试获取不存在的知识"""
        response = client.get("/api/knowledge/99999")
        assert response.status_code == 404