"""
用户服务测试
"""
import pytest
from datetime import datetime, timedelta
from backend.services.user_service import UserService
from backend.models import User
from backend.database import SessionLocal


class TestUserService:
    """用户服务测试"""

    @pytest.fixture
    def user_service(self):
        """创建用户服务实例"""
        db = SessionLocal()
        try:
            yield UserService(db)
        finally:
            db.close()

    def test_create_user(self, user_service):
        """测试创建用户"""
        user = user_service.create_user(
            username="test_user",
            email="test@example.com",
            password="password123",
            role="user"
        )
        
        assert user is not None
        assert user.username == "test_user"
        assert user.email == "test@example.com"
        assert user.role == "user"
        assert user.hashed_password != "password123"

    def test_get_user_by_id(self, user_service):
        """测试根据ID获取用户"""
        user = user_service.create_user(
            username="test_user",
            email="test@example.com",
            password="password123"
        )
        
        retrieved_user = user_service.get_user_by_id(user.id)
        assert retrieved_user is not None
        assert retrieved_user.id == user.id
        assert retrieved_user.username == "test_user"

    def test_get_user_by_username(self, user_service):
        """测试根据用户名获取用户"""
        user = user_service.create_user(
            username="unique_user",
            email="unique@example.com",
            password="password123"
        )
        
        retrieved_user = user_service.get_user_by_username("unique_user")
        assert retrieved_user is not None
        assert retrieved_user.username == "unique_user"

    def test_get_user_by_email(self, user_service):
        """测试根据邮箱获取用户"""
        user = user_service.create_user(
            username="email_user",
            email="email@example.com",
            password="password123"
        )
        
        retrieved_user = user_service.get_user_by_email("email@example.com")
        assert retrieved_user is not None
        assert retrieved_user.email == "email@example.com"

    def test_update_user(self, user_service):
        """测试更新用户信息"""
        user = user_service.create_user(
            username="update_user",
            email="update@example.com",
            password="password123"
        )
        
        updated_user = user_service.update_user(
            user.id,
            email="newemail@example.com",
            role="admin"
        )
        
        assert updated_user.email == "newemail@example.com"
        assert updated_user.role == "admin"

    def test_delete_user(self, user_service):
        """测试删除用户"""
        user = user_service.create_user(
            username="delete_user",
            email="delete@example.com",
            password="password123"
        )
        
        result = user_service.delete_user(user.id)
        assert result is True
        
        deleted_user = user_service.get_user_by_id(user.id)
        assert deleted_user is None

    def test_get_all_users(self, user_service):
        """测试获取所有用户"""
        for i in range(5):
            user_service.create_user(
                username=f"user_{i}",
                email=f"user{i}@example.com",
                password="password123"
            )
        
        users = user_service.get_all_users()
        assert len(users) >= 5

    def test_get_users_with_pagination(self, user_service):
        """测试分页获取用户"""
        for i in range(10):
            user_service.create_user(
                username=f"page_user_{i}",
                email=f"page{i}@example.com",
                password="password123"
            )
        
        users = user_service.get_all_users(skip=0, limit=5)
        assert len(users) == 5

    def test_update_user_last_login(self, user_service):
        """测试更新用户最后登录时间"""
        user = user_service.create_user(
            username="login_user",
            email="login@example.com",
            password="password123"
        )
        
        updated_user = user_service.update_last_login(user.id)
        assert updated_user.last_login is not None
        assert updated_user.last_login <= datetime.utcnow()

    def test_update_user_subscription(self, user_service):
        """测试更新用户订阅信息"""
        user = user_service.create_user(
            username="sub_user",
            email="sub@example.com",
            password="password123"
        )
        
        expire_date = datetime.utcnow() + timedelta(days=30)
        updated_user = user_service.update_subscription(
            user.id,
            plan_id=1,
            expire_at=expire_date
        )
        
        assert updated_user.plan_id == 1
        assert updated_user.expire_at == expire_date