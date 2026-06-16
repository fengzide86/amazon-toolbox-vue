"""
AI 提供商测试
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from services import ai_provider


class TestAIProvider:
    """AI 提供商测试"""

    @pytest.mark.asyncio
    async def test_qwen_chat_mock(self):
        """测试通义千问对话（Mock）"""
        mock_response = {
            "choices": [{"message": {"content": "测试回复"}}]
        }
        
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_response
            mock_resp.raise_for_status = MagicMock()  # 同步方法
            
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_client_instance
            
            result = await ai_provider.qwen_chat([{"role": "user", "content": "测试"}])
            
            assert result == "测试回复"

    @pytest.mark.asyncio
    async def test_qwen_embedding_mock(self):
        """测试通义千问 Embedding（Mock）"""
        mock_response = {
            "data": [{"embedding": [0.1, 0.2, 0.3]}]
        }
        
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_response
            mock_resp.raise_for_status = MagicMock()  # 同步方法
            
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_client_instance
            
            result = await ai_provider.qwen_embedding("测试文本")
            
            assert result == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    async def test_qwen_chat_error(self):
        """测试通义千问对话错误处理"""
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(side_effect=Exception("网络错误"))
            mock_client.return_value = mock_client_instance
            
            with pytest.raises(Exception) as exc_info:
                await ai_provider.qwen_chat([{"role": "user", "content": "测试"}])
            
            assert "网络错误" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_qwen_embedding_error(self):
        """测试通义千问 Embedding 错误处理"""
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(side_effect=Exception("网络错误"))
            mock_client.return_value = mock_client_instance
            
            result = await ai_provider.qwen_embedding("测试文本")
            
            assert result is None

    @pytest.mark.asyncio
    async def test_qwen_chat_with_model(self):
        """测试指定模型参数"""
        mock_response = {"choices": [{"message": {"content": "回复"}}]}
        
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_response
            mock_resp.raise_for_status = MagicMock()
            
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_client_instance
            
            await ai_provider.qwen_chat([{"role": "user", "content": "测试"}], model="qwen3.7-plus")
            
            # 验证使用了指定模型
            call_args = mock_client_instance.post.call_args
            assert call_args[1]["json"]["model"] == "qwen3.7-plus"

    @pytest.mark.asyncio
    async def test_qwen_embedding_truncates_long_text(self):
        """测试 Embedding 长文本截断"""
        mock_response = {"data": [{"embedding": [0.1]}]}
        
        with patch('services.ai_provider._get_http_client') as mock_client:
            mock_resp = MagicMock()
            mock_resp.json.return_value = mock_response
            mock_resp.raise_for_status = MagicMock()
            
            mock_client_instance = AsyncMock()
            mock_client_instance.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_client_instance
            
            long_text = "a" * 10000
            await ai_provider.qwen_embedding(long_text)
            
            call_args = mock_client_instance.post.call_args
            assert len(call_args[1]["json"]["input"]) == 8000