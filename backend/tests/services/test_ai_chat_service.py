"""
AI 对话服务测试
"""
import pytest
from unittest.mock import patch, AsyncMock
from services import ai_chat_service


class TestAIChatService:
    """AI 对话服务测试"""

    @pytest.mark.asyncio
    async def test_create_session(self, db_session):
        """测试创建会话"""
        result = await ai_chat_service.create_session(db_session, user_id=1)
        
        assert "session_id" in result
        assert result["status"] == "active"
        assert "welcome_message" in result
        assert "suggested_questions" in result

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, db_session):
        """测试获取不存在的会话"""
        result = await ai_chat_service.get_session(db_session, "nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_session(self, db_session):
        """测试标记会话已解决"""
        # 先创建会话
        session = await ai_chat_service.create_session(db_session, user_id=1)
        session_id = session["session_id"]
        
        # 标记已解决
        result = await ai_chat_service.resolve_session(db_session, session_id, satisfaction=5)
        assert result is True

    @pytest.mark.asyncio
    async def test_rate_session(self, db_session):
        """测试满意度评分"""
        session = await ai_chat_service.create_session(db_session, user_id=1)
        session_id = session["session_id"]
        
        result = await ai_chat_service.rate_session(db_session, session_id, 4)
        assert result is True

    @pytest.mark.asyncio
    async def test_get_user_history(self, db_session):
        """测试获取用户对话历史"""
        # 创建几个会话
        await ai_chat_service.create_session(db_session, user_id=1)
        await ai_chat_service.create_session(db_session, user_id=1)
        
        result = await ai_chat_service.get_user_history(db_session, user_id=1)
        
        assert "items" in result
        assert "total" in result
        assert result["total"] >= 2

    @pytest.mark.asyncio
    async def test_get_admin_sessions(self, db_session):
        """测试管理员获取所有会话"""
        await ai_chat_service.create_session(db_session, user_id=1)
        
        result = await ai_chat_service.get_admin_sessions(db_session)
        
        assert "items" in result
        assert "total" in result

    @pytest.mark.asyncio
    async def test_get_admin_stats(self, db_session):
        """测试获取统计数据"""
        await ai_chat_service.create_session(db_session, user_id=1)
        
        stats = await ai_chat_service.get_admin_stats(db_session)
        
        assert "total_sessions" in stats
        assert "resolved" in stats
        assert "transferred" in stats
        assert "resolve_rate" in stats
        assert "transfer_rate" in stats
        assert "avg_satisfaction" in stats
        assert "today_sessions" in stats

    @pytest.mark.asyncio
    async def test_get_config(self, db_session):
        """测试获取配置"""
        config = await ai_chat_service.get_config(db_session)
        
        assert "welcome_message" in config
        assert "suggested_questions" in config
        assert "ai_model" in config

    @pytest.mark.asyncio
    async def test_update_config(self, db_session):
        """测试更新配置"""
        updates = {
            "welcome_message": "新的欢迎语",
            "ai_model": "qwen-turbo"
        }
        
        config = await ai_chat_service.update_config(db_session, updates)
        
        assert config["welcome_message"] == "新的欢迎语"
        assert config["ai_model"] == "qwen-turbo"