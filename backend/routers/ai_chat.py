"""
AI 客服对话路由模块
提供会话管理、消息收发（SSE 流式）、转人工等 API
"""
import json
from collections.abc import AsyncIterator
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_user
from database import get_db
from domains.knowledge import chat_service as ai_chat_service
from models import ChatSession
from schemas.ai_chat import (
    AdminChatSessionsResponse,
    AdminChatStatsResponse,
    ChatActionResponse,
    ChatConfigResponse,
    ChatHistoryResponse,
    ChatReplyResponse,
    ChatSessionCreatedResponse,
    ChatSessionDetailResponse,
    ChatTransferResponse,
    CreateSessionRequest,
    DebugChatRequest,
    DebugChatResponse,
    RateSessionRequest,
    ResolveSessionRequest,
    SendMessageRequest,
    UpdateChatConfigRequest,
)

router = APIRouter()


# ===== 用户端路由 =====

@router.post("/session", response_model=ChatSessionCreatedResponse)
async def create_session(
    req: CreateSessionRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """创建/恢复会话"""
    user_id = current_user.get("user_id")
    return await ai_chat_service.create_session(
        db,
        user_id=user_id,
        platform_key=req.platform_key if req else None,
        capability_key=req.capability_key if req else None,
    )


async def _require_session_owner(
    db: AsyncSession,
    session_id: str,
    current_user: dict[str, Any],
) -> ChatSession:
    record = await ai_chat_service.get_session_record(db, session_id)
    if not record:
        raise HTTPException(status_code=404, detail="会话不存在")
    if record.user_id != current_user.get("user_id"):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    return record


@router.get("/session/{session_id}", response_model=ChatSessionDetailResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """获取会话详情（含消息列表）"""
    await _require_session_owner(db, session_id, current_user)
    session = await ai_chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.post("/session/{session_id}/message", response_model=ChatReplyResponse)
async def send_message(
    session_id: str,
    req: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """发送消息（非流式，返回完整回答）"""
    await _require_session_owner(db, session_id, current_user)
    result = await ai_chat_service.send_message(
        db, session_id, req.message, req.platform_key, req.capability_key
    )
    # 用户端只消费解决问题所需的信息。检索耗时、模型、供应商和
    # fallback 原因属于运营诊断，不能暴露成客户需要理解的指标。
    return {
        "session_id": result["session_id"],
        "reply": result["reply"],
        "answer_mode": result["answer_mode"],
        "ai_used": False,
        "should_transfer": result.get("should_transfer", False),
        "knowledge_refs": result.get("knowledge_refs", []),
    }


@router.post(
    "/session/{session_id}/message/stream",
    response_class=StreamingResponse,
    response_model=None,
    responses={
        200: {
            "description": "Server-sent rule/FAQ answer chunks followed by [DONE]",
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
        }
    },
)
async def send_message_stream(
    session_id: str,
    req: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> StreamingResponse:
    """发送消息（SSE 流式返回）"""
    await _require_session_owner(db, session_id, current_user)
    result = await ai_chat_service.send_message(
        db,
        session_id,
        req.message,
        req.platform_key,
        req.capability_key,
    )
    reply = str(result["reply"])

    async def event_generator() -> AsyncIterator[str]:
        yield f"data: {json.dumps({'content': reply}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/session/{session_id}/resolve", response_model=ChatActionResponse)
async def resolve_session(
    session_id: str,
    req: ResolveSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str]:
    """标记会话已解决"""
    await _require_session_owner(db, session_id, current_user)
    success = await ai_chat_service.resolve_session(db, session_id, req.satisfaction)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"message": "已标记为已解决"}


@router.post("/session/{session_id}/transfer", response_model=ChatTransferResponse)
async def transfer_to_human(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str | int | None]:
    """转人工（自动创建工单）"""
    await _require_session_owner(db, session_id, current_user)
    user_id = cast(int, current_user.get("user_id"))
    feedback_id = await ai_chat_service.transfer_to_human(db, session_id, user_id=user_id)
    return {"message": "已转人工客服", "feedback_id": feedback_id}


@router.post("/session/{session_id}/rate", response_model=ChatActionResponse)
async def rate_session(
    session_id: str,
    req: RateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, str]:
    """满意度评分"""
    await _require_session_owner(db, session_id, current_user)
    success = await ai_chat_service.rate_session(db, session_id, req.satisfaction)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"message": "评分已记录"}


@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """获取我的对话历史"""
    user_id = cast(int, current_user.get("user_id"))
    return await ai_chat_service.get_user_history(db, user_id, page, page_size)


# ===== 管理端路由 =====

@router.post("/admin/debug", response_model=DebugChatResponse)
async def debug_chat(
    req: DebugChatRequest,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """Preview one stateless local FAQ/rule answer for an operator."""
    result = await ai_chat_service.answer_question(
        db,
        req.message,
        platform_key=req.platform_key,
        capability_key=req.capability_key,
        session_id=None,
    )
    return {
        "reply": result["reply"],
        "answer_mode": result["answer_mode"],
        "ai_used": False,
        "knowledge_refs": result.get("knowledge_refs", []),
        "fallback_reason": result.get("fallback_reason"),
        "should_transfer": result.get("should_transfer", False),
        "diagnostics": {
            "total_ms": result.get("diagnostics", {}).get("total_ms", 0),
        },
    }

@router.get("/admin/config", response_model=ChatConfigResponse)
async def get_config(
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """获取 AI 客服配置"""
    return await ai_chat_service.get_config(db)


@router.put("/admin/config", response_model=ChatConfigResponse)
async def update_config(
    req: UpdateChatConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """更新 AI 客服配置"""
    updates = req.model_dump(exclude_none=True)
    return await ai_chat_service.update_config(db, updates, actor=actor, request=request)


@router.get("/admin/sessions", response_model=AdminChatSessionsResponse)
async def get_admin_sessions(
    status: str | None = Query(None, description="状态过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """获取所有对话记录（管理员）"""
    return await ai_chat_service.get_admin_sessions(db, status=status, page=page, page_size=page_size)


@router.get("/admin/sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_admin_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """获取对话详情（管理员）"""
    session = await ai_chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.get("/admin/stats", response_model=AdminChatStatsResponse)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _admin: dict[str, Any] = Depends(get_current_admin),
) -> dict[str, Any]:
    """获取 AI 客服统计数据"""
    return await ai_chat_service.get_admin_stats(db)
