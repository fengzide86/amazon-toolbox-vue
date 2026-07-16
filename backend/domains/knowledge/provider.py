"""
AI 提供商适配层
支持通义千问(默认)、OpenAI、本地Ollama
"""
import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)

# HTTP 客户端（复用连接）
_http_client = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=60.0)
    return _http_client


# ===== 通义千问 =====

QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

async def qwen_chat(messages: list[dict[str, Any]], model: str | None = None) -> str:
    """通义千问对话（非流式）"""
    model = model or settings.QWEN_MODEL
    client = _get_http_client()
    
    try:
        resp = await client.post(
            f"{QWEN_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.QWEN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2000,
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"通义千问对话失败: {e}")
        raise


async def qwen_chat_stream(messages: list[dict[str, Any]], model: str | None = None) -> AsyncGenerator[str]:
    """通义千问对话（流式）"""
    model = model or settings.QWEN_MODEL
    client = _get_http_client()
    
    try:
        async with client.stream(
            "POST",
            f"{QWEN_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.QWEN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2000,
                "stream": True,
            }
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.error(f"通义千问流式对话失败: {e}")
        raise


async def qwen_embedding(text: str, model: str | None = None) -> list[float] | None:
    """通义千问文本向量化"""
    model = model or settings.QWEN_EMBEDDING_MODEL
    client = _get_http_client()
    
    try:
        resp = await client.post(
            f"{QWEN_BASE_URL}/embeddings",
            headers={
                "Authorization": f"Bearer {settings.QWEN_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": text[:8000],  # 限制长度
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]
    except Exception as e:
        logger.error(f"通义千问Embedding失败: {e}")
        return None


# ===== OpenAI =====

async def openai_chat(messages: list[dict[str, Any]], model: str | None = None) -> str:
    """OpenAI对话（非流式）"""
    api_key = settings.OPENAI_API_KEY
    model = model or settings.OPENAI_MODEL
    client = _get_http_client()
    
    try:
        resp = await client.post(
            f"{settings.OPENAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2000,
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"OpenAI对话失败: {e}")
        raise


async def openai_chat_stream(messages: list[dict[str, Any]], model: str | None = None) -> AsyncGenerator[str]:
    """OpenAI对话（流式）"""
    api_key = settings.OPENAI_API_KEY
    model = model or settings.OPENAI_MODEL
    client = _get_http_client()
    
    try:
        async with client.stream(
            "POST",
            f"{settings.OPENAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 2000,
                "stream": True,
            }
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.error(f"OpenAI流式对话失败: {e}")
        raise


async def openai_embedding(text: str, model: str | None = None) -> list[float] | None:
    """OpenAI文本向量化"""
    api_key = settings.OPENAI_API_KEY
    model = model or settings.OPENAI_EMBEDDING_MODEL
    client = _get_http_client()
    
    try:
        resp = await client.post(
            f"{settings.OPENAI_BASE_URL}/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "input": text[:8000],
            }
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]
    except Exception as e:
        logger.error(f"OpenAI Embedding失败: {e}")
        return None


# ===== 统一接口 =====

def has_api_key() -> bool:
    return bool(settings.OPENAI_API_KEY if settings.AI_PROVIDER == "openai" else settings.QWEN_API_KEY)


async def chat_completion(messages: list[dict[str, Any]], model: str | None = None) -> str:
    """统一对话接口（非流式）"""
    provider = settings.AI_PROVIDER
    
    if provider == "openai":
        return await openai_chat(messages, model=model)
    else:
        return await qwen_chat(messages, model=model)


async def chat_completion_stream(messages: list[dict[str, Any]], model: str | None = None) -> AsyncGenerator[str]:
    """统一对话接口（流式）"""
    provider = settings.AI_PROVIDER
    
    if provider == "openai":
        async for chunk in openai_chat_stream(messages, model=model):
            yield chunk
    else:
        async for chunk in qwen_chat_stream(messages, model=model):
            yield chunk


async def get_embedding(text: str) -> list[float] | None:
    """统一Embedding接口"""
    provider = settings.AI_PROVIDER
    
    if provider == "openai":
        return await openai_embedding(text)
    else:
        return await qwen_embedding(text)


async def close() -> None:
    """关闭HTTP客户端"""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None
