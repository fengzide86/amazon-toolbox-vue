"""
公告 API 测试
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.main import app
from backend.database import get_db
from backend.models import Announcement, User
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


class TestAnnouncementsAPI:
    """公告 API 测试"""

    @pytest.mark.asyncio
    async def test_get_announcements(self, client, db_session):
        """测试获取公告列表"""
        # 创建测试公告
        announcement = Announcement(
            title="测试公告",
            content="公告内容",
            is_active=True
        )
        db_session.add(announcement)
        await db_session.commit()

        response = client.get("/api/announcements")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["title"] == "测试公告"

    @pytest.mark.asyncio
    async def test_get_announcement_by_id(self, client, db_session):
        """测试根据 ID 获取公告"""
        announcement = Announcement(
            title="测试公告2",
            content="公告内容2",
            is_active=True
        )
        db_session.add(announcement)
        await db_session.commit()
        await db_session.refresh(announcement)

        response = client.get(f"/api/announcements/{announcement.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "测试公告2"

    @pytest.mark.asyncio
    async def test_create_announcement_admin(self, client, admin_token):
        """测试管理员创建公告"""
        response = client.post(
            "/api/announcements",
            json={"title": "新公告", "content": "内容", "is_active": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "新公告"

    @pytest.mark.asyncio
    async def test_create_announcement_user_forbidden(self, client, user_token):
        """测试普通用户不能创建公告"""
        response = client.post(
            "/api/announcements",
            json={"title": "新公告", "content": "内容"},
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_announcement(self, client, db_session, admin_token):
        """测试更新公告"""
        announcement = Announcement(
            title="原标题",
            content="原内容",
            is_active=True
        )
        db_session.add(announcement)
        await db_session.commit()
        await db_session.refresh(announcement)

        response = client.put(
            f"/api/announcements/{announcement.id}",
            json={"title": "新标题", "content": "新内容"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "新标题"

    @pytest.mark.asyncio
    async def test_delete_announcement(self, client, db_session, admin_token):
        """测试删除公告"""
        announcement = Announcement(
            title="待删除公告",
            content="内容",
            is_active=True
        )
        db_session.add(announcement)
        await db_session.commit()
        await db_session.refresh(announcement)

        response = client.delete(
            f"/api/announcements/{announcement.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_nonexistent_announcement(self, client):
        """测试获取不存在的公告"""
        response = client.get("/api/announcements/99999")
        assert response.status_code == 404