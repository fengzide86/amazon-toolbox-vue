"""
AI 客服对话路由模块
提供会话管理、消息收发（SSE 流式）、转人工等 API
"""
import json
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from pydantic import BaseModel

from database import get_db
from core.dependencies import get_current_admin, get_current_user, get_optional_current_user
from services import ai_chat_service

router = APIRouter()


# ===== 请求体模型 =====

class SendMessage(BaseModel):
    message: str


class ResolveSession(BaseModel):
    satisfaction: Optional[int] = None


class RateSession(BaseModel):
    satisfaction: int


class UpdateConfig(BaseModel):
    welcome_message: Optional[str] = None
    suggested_questions: Optional[list] = None
    ai_model: Optional[str] = None
    reply_style: Optional[str] = None
    max_retries: Optional[int] = None
    transfer_rules: Optional[dict] = None


# ===== 用户端路由 =====

@router.post("/session")
async def create_session(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[dict] = Depends(get_optional_current_user),
):
    """创建/恢复会话"""
    user_id = current_user.get("user_id") if current_user else None
    return await ai_chat_service.create_session(db, user_id=user_id)


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """获取会话详情（含消息列表）"""
    session = await ai_chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.post("/session/{session_id}/message")
async def send_message(
    session_id: str,
    req: SendMessage,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """发送消息（非流式，返回完整回答）"""
    return await ai_chat_service.send_message(db, session_id, req.message)


@router.post("/session/{session_id}/message/stream")
async def send_message_stream(
    session_id: str,
    req: SendMessage,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """发送消息（SSE 流式返回）"""
    async def event_generator():
        async for chunk in ai_chat_service.send_message_stream(db, session_id, req.message):
            yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
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


@router.post("/session/{session_id}/resolve")
async def resolve_session(
    session_id: str,
    req: ResolveSession,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """标记会话已解决"""
    success = await ai_chat_service.resolve_session(db, session_id, req.satisfaction)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"message": "已标记为已解决"}


@router.post("/session/{session_id}/transfer")
async def transfer_to_human(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """转人工（自动创建工单）"""
    user_id = current_user.get("user_id")
    feedback_id = await ai_chat_service.transfer_to_human(db, session_id, user_id=user_id)
    return {"message": "已转人工客服", "feedback_id": feedback_id}


@router.post("/session/{session_id}/rate")
async def rate_session(
    session_id: str,
    req: RateSession,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """满意度评分"""
    success = await ai_chat_service.rate_session(db, session_id, req.satisfaction)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"message": "评分已记录"}


@router.get("/history")
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """获取我的对话历史"""
    user_id = current_user.get("user_id")
    return await ai_chat_service.get_user_history(db, user_id, page, page_size)


# ===== 管理端路由 =====

@router.get("/admin/config")
async def get_config(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取 AI 客服配置"""
    return await ai_chat_service.get_config(db)


@router.put("/admin/config")
async def update_config(
    req: UpdateConfig,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """更新 AI 客服配置"""
    updates = req.model_dump(exclude_none=True)
    # 将 list/dict 类型序列化为 JSON 字符串
    if "suggested_questions" in updates:
        updates["suggested_questions"] = json.dumps(updates["suggested_questions"], ensure_ascii=False)
    if "transfer_rules" in updates:
        updates["transfer_rules"] = json.dumps(updates["transfer_rules"], ensure_ascii=False)
    return await ai_chat_service.update_config(db, updates)


@router.get("/admin/sessions")
async def get_admin_sessions(
    status: Optional[str] = Query(None, description="状态过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取所有对话记录（管理员）"""
    return await ai_chat_service.get_admin_sessions(db, status=status, page=page, page_size=page_size)


@router.get("/admin/sessions/{session_id}")
async def get_admin_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取对话详情（管理员）"""
    session = await ai_chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.get("/admin/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取 AI 客服统计数据"""
    return await ai_chat_service.get_admin_stats(db)