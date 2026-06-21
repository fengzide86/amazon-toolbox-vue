"""
反馈服务测试
"""
import pytest
from datetime import datetime
from backend.services.feedback_service import FeedbackService
from backend.models import Feedback, User
from backend.database import SessionLocal


class TestFeedbackService:
    """反馈服务测试"""

    @pytest.fixture
    def feedback_service(self):
        """创建反馈服务实例"""
        db = SessionLocal()
        try:
            yield FeedbackService(db)
        finally:
            db.close()

    @pytest.fixture
    def test_user(self, feedback_service):
        """创建测试用户"""
        user = User(
            username="test_user",
            email="test@example.com",
            hashed_password="hashed"
        )
        feedback_service.db.add(user)
        feedback_service.db.commit()
        feedback_service.db.refresh(user)
        return user

    def test_create_feedback(self, feedback_service, test_user):
        """测试创建反馈"""
        feedback = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Test Feedback",
            content="This is a test feedback",
            category="bug"
        )
        
        assert feedback is not None
        assert feedback.user_id == test_user.id
        assert feedback.title == "Test Feedback"
        assert feedback.content == "This is a test feedback"
        assert feedback.category == "bug"
        assert feedback.status == "pending"

    def test_get_feedback_by_id(self, feedback_service, test_user):
        """测试根据ID获取反馈"""
        feedback = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Test Feedback",
            content="Content"
        )
        
        retrieved = feedback_service.get_feedback_by_id(feedback.id)
        assert retrieved is not None
        assert retrieved.id == feedback.id
        assert retrieved.title == "Test Feedback"

    def test_get_user_feedbacks(self, feedback_service, test_user):
        """测试获取用户反馈列表"""
        for i in range(3):
            feedback_service.create_feedback(
                user_id=test_user.id,
                title=f"Feedback {i}",
                content=f"Content {i}"
            )
        
        feedbacks = feedback_service.get_user_feedbacks(test_user.id)
        assert len(feedbacks) == 3

    def test_update_feedback_status(self, feedback_service, test_user):
        """测试更新反馈状态"""
        feedback = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Test Feedback",
            content="Content"
        )
        
        updated = feedback_service.update_feedback_status(
            feedback.id,
            status="processing",
            admin_reply="We are working on it"
        )
        
        assert updated.status == "processing"
        assert updated.admin_reply == "We are working on it"
        assert updated.processed_at is not None

    def test_close_feedback(self, feedback_service, test_user):
        """测试关闭反馈"""
        feedback = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Test Feedback",
            content="Content"
        )
        
        closed = feedback_service.close_feedback(
            feedback.id,
            admin_reply="Issue resolved"
        )
        
        assert closed.status == "closed"
        assert closed.admin_reply == "Issue resolved"
        assert closed.closed_at is not None

    def test_get_all_feedbacks(self, feedback_service, test_user):
        """测试获取所有反馈"""
        for i in range(5):
            feedback_service.create_feedback(
                user_id=test_user.id,
                title=f"Feedback {i}",
                content=f"Content {i}"
            )
        
        feedbacks = feedback_service.get_all_feedbacks()
        assert len(feedbacks) >= 5

    def test_get_feedbacks_by_status(self, feedback_service, test_user):
        """测试根据状态获取反馈"""
        feedback1 = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Pending Feedback",
            content="Content"
        )
        feedback2 = feedback_service.create_feedback(
            user_id=test_user.id,
            title="Processing Feedback",
            content="Content"
        )
        feedback_service.update_feedback_status(feedback2.id, status="processing")
        
        pending = feedback_service.get_feedbacks_by_status("pending")
        processing = feedback_service.get_feedbacks_by_status("processing")
        
        assert len(pending) >= 1
        assert len(processing) >= 1
        assert all(f.status == "pending" for f in pending)
        assert all(f.status == "processing" for f in processing)

    def test_get_feedback_statistics(self, feedback_service, test_user):
        """测试获取反馈统计"""
        for i in range(3):
            feedback_service.create_feedback(
                user_id=test_user.id,
                title=f"Feedback {i}",
                content=f"Content {i}",
                category="bug"
            )
        for i in range(2):
            feedback_service.create_feedback(
                user_id=test_user.id,
                title=f"Feedback {i}",
                content=f"Content {i}",
                category="feature"
            )
        
        stats = feedback_service.get_feedback_statistics()
        
        assert "total" in stats
        assert "by_status" in stats
        assert "by_category" in stats
        assert stats["total"] >= 5
        assert stats["by_category"]["bug"] >= 3
        assert stats["by_category"]["feature"] >= 2