"""
AI 客服对话服务
处理会话管理、消息收发、向量检索、流式响应等
"""
import json
import uuid
from typing import List, Optional, Dict, Any, AsyncGenerator
from datetime import datetime
from sqlalchemy import select, func, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from models import ChatSession, ChatMessage, ChatConfig, Feedback, User
from services import ai_provider, vector_store
from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)

# ===== AI 回退提示 =====
FALLBACK_REPLIES = {
    "no_api_key": "抱歉，AI 客服暂未配置。您可以先查看 FAQ，或提交工单联系人工客服。",
    "timeout": "AI 响应超时，请稍后再试。如问题持续，请提交工单联系人工客服。",
    "rate_limit": "当前咨询人数较多，AI 暂时繁忙。请稍后再试或提交工单。",
    "provider_error": "AI 服务暂时不可用，请稍后再试。您也可以查看 FAQ 或提交工单。",
    "invalid_config": "AI 配置异常，请联系管理员或提交工单。",
    "unknown_error": "AI 诊断暂时不可用。您可以查看 FAQ 或提交工单联系人工客服。",
}

# ===== 敏感内容检测 =====
SENSITIVE_KEYWORDS = ["暴力", "色情", "赌博", "毒品", "诈骗", "政治敏感", "反动"]
SENSITIVE_CONTENT_REPLY = "AI 诊断仅支持工具、授权、安装、报错和平台操作问题。如涉及其他问题，请提交工单联系人工客服。"


def _check_sensitive_content(message: str) -> bool:
    """
    检测敏感内容
    仅用于 AI 诊断输入和输出，不影响普通 FAQ 查询
    """
    if not message:
        return False
    message_lower = message.lower()
    return any(kw in message_lower for kw in SENSITIVE_KEYWORDS)

# 默认配置
DEFAULT_CONFIG = {
    "welcome_message": "你好！我是亚马逊工具箱智能客服 🤖\n请问有什么可以帮你的？",
    "suggested_questions": json.dumps([
        "如何安装工具箱？",
        "授权码怎么使用？",
        "脚本运行报错怎么办？",
        "物流模板怎么生成？",
        "套餐有什么区别？",
    ], ensure_ascii=False),
    "ai_model": "qwen-turbo",
    "reply_style": "concise",
    "max_retries": "2",
    "transfer_rules": json.dumps({
        "refund_direct_transfer": True,
        "complaint_direct_transfer": True,
        "auto_transfer_after_retries": True,
        "account_direct_transfer": False,
    }),
}


async def get_config(db: AsyncSession) -> Dict[str, Any]:
    """获取AI客服配置"""
    result = await db.execute(select(ChatConfig))
    configs = result.scalars().all()

    config_dict = {}
    for c in configs:
        config_dict[c.key] = c.value

    # 合并默认配置
    merged = {}
    for key, default_val in DEFAULT_CONFIG.items():
        merged[key] = config_dict.get(key, default_val)

    return merged


async def update_config(db: AsyncSession, updates: Dict[str, Any]) -> Dict:
    """更新AI客服配置"""
    for key, value in updates.items():
        if key not in DEFAULT_CONFIG:
            continue
        result = await db.execute(
            select(ChatConfig).where(ChatConfig.key == key)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = str(value) if not isinstance(value, str) else value
        else:
            db.add(ChatConfig(key=key, value=str(value) if not isinstance(value, str) else value))

    await db.commit()
    return await get_config(db)


async def create_session(db: AsyncSession, user_id: int = None) -> Dict:
    """创建新会话"""
    session_id = str(uuid.uuid4())[:12]

    session = ChatSession(
        user_id=user_id,
        session_id=session_id,
        status="active",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # 添加欢迎消息
    config = await get_config(db)
    welcome = ChatMessage(
        session_id=session_id,
        role="system",
        content=config.get("welcome_message", DEFAULT_CONFIG["welcome_message"]),
    )
    db.add(welcome)
    await db.commit()

    return {
        "session_id": session_id,
        "status": "active",
        "welcome_message": config.get("welcome_message", DEFAULT_CONFIG["welcome_message"]),
        "suggested_questions": json.loads(config.get("suggested_questions", DEFAULT_CONFIG["suggested_questions"])),
    }


async def get_session(db: AsyncSession, session_id: str) -> Optional[Dict]:
    """获取会话详情"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None

    # 获取消息
    messages_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = messages_result.scalars().all()

    return {
        "session_id": session.session_id,
        "status": session.status,
        "message_count": session.message_count,
        "ai_resolved": session.ai_resolved,
        "transferred_to_human": session.transferred_to_human,
        "satisfaction": session.satisfaction,
        "messages": [_message_to_dict(m) for m in messages],
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


async def send_message(
    db: AsyncSession,
    session_id: str,
    user_message: str,
) -> Dict:
    """发送消息（非流式，返回完整回答）"""
    # 保存用户消息
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg)

    # 更新会话消息数
    await db.execute(
        sql_update(ChatSession)
        .where(ChatSession.session_id == session_id)
        .values(message_count=ChatSession.message_count + 1)
    )
    await db.commit()

    # 敏感内容检测（仅用于 AI 诊断，不影响 FAQ）
    if _check_sensitive_content(user_message):
        ai_reply = SENSITIVE_CONTENT_REPLY
        # 保存 AI 回复
        ai_msg = ChatMessage(
            session_id=session_id,
            role="ai",
            content=ai_reply,
        )
        db.add(ai_msg)
        await db.execute(
            sql_update(ChatSession)
            .where(ChatSession.session_id == session_id)
            .values(message_count=ChatSession.message_count + 1)
        )
        await db.commit()
        return {
            "reply": ai_reply,
            "knowledge_refs": [],
            "session_id": session_id,
        }

    # 检索知识库
    knowledge_results = []
    try:
        query_embedding = await ai_provider.get_embedding(user_message)
        if query_embedding:
            knowledge_results = await vector_store.search_knowledge(
                query_embedding=query_embedding,
                top_k=5,
                min_score=0.3,
            )
    except Exception as e:
        logger.warning(f"知识库检索失败: {e}")

    # 构建 AI 消息
    config = await get_config(db)
    messages = await _build_ai_messages(db, session_id, user_message, knowledge_results, config)

    # 调用 AI（带错误分类和回退）
    ai_reply = None
    error_type = None
    try:
        ai_reply = await ai_provider.chat_completion(messages)
    except Exception as e:
        error_str = str(e).lower()
        logger.error(f"AI 对话失败: {e}")
        
        # 错误分类
        if not settings.QWEN_API_KEY:
            error_type = "no_api_key"
        elif "timeout" in error_str or "timed out" in error_str:
            error_type = "timeout"
        elif "rate limit" in error_str or "429" in error_str:
            error_type = "rate_limit"
        elif "invalid" in error_str or "config" in error_str:
            error_type = "invalid_config"
        else:
            error_type = "provider_error"
        
        ai_reply = FALLBACK_REPLIES.get(error_type, FALLBACK_REPLIES["unknown_error"])

    # 保存 AI 消息
    knowledge_ids = [str(r["knowledge_id"]) for r in knowledge_results if r.get("knowledge_id")]
    ai_msg = ChatMessage(
        session_id=session_id,
        role="ai",
        content=ai_reply,
        knowledge_ids=json.dumps(knowledge_ids) if knowledge_ids else None,
    )
    db.add(ai_msg)
    await db.execute(
        sql_update(ChatSession)
        .where(ChatSession.session_id == session_id)
        .values(message_count=ChatSession.message_count + 1)
    )
    await db.commit()

    return {
        "reply": ai_reply,
        "knowledge_refs": knowledge_results,
        "session_id": session_id,
    }


async def send_message_stream(
    db: AsyncSession,
    session_id: str,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """发送消息（流式返回）"""
    # 保存用户消息
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg)
    await db.execute(
        sql_update(ChatSession)
        .where(ChatSession.session_id == session_id)
        .values(message_count=ChatSession.message_count + 1)
    )
    await db.commit()

    # 检索知识库
    knowledge_results = []
    try:
        query_embedding = await ai_provider.get_embedding(user_message)
        if query_embedding:
            knowledge_results = await vector_store.search_knowledge(
                query_embedding=query_embedding,
                top_k=5,
                min_score=0.3,
            )
    except Exception as e:
        logger.warning(f"知识库检索失败: {e}")

    # 构建 AI 消息
    config = await get_config(db)
    messages = await _build_ai_messages(db, session_id, user_message, knowledge_results, config)

    # 流式调用 AI
    full_reply = ""
    try:
        async for chunk in ai_provider.chat_completion_stream(messages):
            full_reply += chunk
            yield chunk
    except Exception as e:
        logger.error(f"AI 流式对话失败: {e}")
        error_msg = '抱歉，AI 服务暂时不可用，请稍后再试或点击「转人工」联系人工客服。'
        full_reply = error_msg
        yield error_msg

    # 保存 AI 消息
    knowledge_ids = [str(r["knowledge_id"]) for r in knowledge_results if r.get("knowledge_id")]
    ai_msg = ChatMessage(
        session_id=session_id,
        role="ai",
        content=full_reply,
        knowledge_ids=json.dumps(knowledge_ids) if knowledge_ids else None,
    )
    db.add(ai_msg)
    await db.execute(
        sql_update(ChatSession)
        .where(ChatSession.session_id == session_id)
        .values(message_count=ChatSession.message_count + 1)
    )
    await db.commit()

    # 最后发送知识引用信息（SSE data: 格式）
    if knowledge_results:
        refs_data = json.dumps({
            "type": "knowledge_refs",
            "refs": [{"id": r["knowledge_id"], "title": r["title"]} for r in knowledge_results[:3]]
        }, ensure_ascii=False)
        yield f"data: {refs_data}\n\n"


async def resolve_session(db: AsyncSession, session_id: str, satisfaction: int = None) -> bool:
    """标记会话已解决"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return False

    session.status = "resolved"
    session.ai_resolved = True
    session.resolved_at = datetime.now()
    if satisfaction is not None:
        session.satisfaction = satisfaction

    await db.commit()
    return True


async def transfer_to_human(db: AsyncSession, session_id: str, user_id: int = None) -> Optional[int]:
    """转人工 - 自动创建工单"""
    # 获取对话记录
    messages_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    messages = messages_result.scalars().all()

    # 构建工单内容
    chat_history = []
    for m in messages:
        role_label = "用户" if m.role == "user" else "AI客服" if m.role == "ai" else "系统"
        chat_history.append(f"[{role_label}] {m.content}")

    title = f"AI客服转人工 - 会话 {session_id}"
    content = f"用户通过 AI 客服咨询后转人工。\n\n对话记录：\n" + "\n".join(chat_history)

    # 创建工单
    feedback = Feedback(
        user_id=user_id,
        title=title,
        content=content,
        status="pending",
        priority="normal",
    )
    db.add(feedback)

    # 更新会话状态
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if session:
        session.status = "transferred"
        session.transferred_to_human = True
        session.resolved_at = datetime.now()

    await db.commit()
    return feedback.id


async def rate_session(db: AsyncSession, session_id: str, satisfaction: int) -> bool:
    """满意度评分"""
    result = await db.execute(
        select(ChatSession).where(ChatSession.session_id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return False

    session.satisfaction = satisfaction
    await db.commit()
    return True


async def get_user_history(db: AsyncSession, user_id: int, page: int = 1, page_size: int = 10) -> Dict:
    """获取用户对话历史"""
    count_query = select(func.count(ChatSession.id)).where(ChatSession.user_id == user_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    sessions = result.scalars().all()

    return {
        "items": [{
            "session_id": s.session_id,
            "status": s.status,
            "message_count": s.message_count,
            "ai_resolved": s.ai_resolved,
            "satisfaction": s.satisfaction,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        } for s in sessions],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_admin_sessions(db: AsyncSession, status: str = None, page: int = 1, page_size: int = 20) -> Dict:
    """管理员获取所有对话记录"""
    query = select(ChatSession)
    count_query = select(func.count(ChatSession.id))

    if status:
        query = query.where(ChatSession.status == status)
        count_query = count_query.where(ChatSession.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(
        query.order_by(ChatSession.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    sessions = result.scalars().all()

    # 批量获取用户名（避免 N+1 查询）
    user_ids = list({s.user_id for s in sessions if s.user_id})
    user_map = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            user_map[u.id] = u.name or u.phone or f"用户{u.id}"

    items = []
    for s in sessions:
        user_name = user_map.get(s.user_id, "匿名用户")

        items.append({
            "session_id": s.session_id,
            "user_id": s.user_id,
            "user_name": user_name,
            "status": s.status,
            "message_count": s.message_count,
            "ai_resolved": s.ai_resolved,
            "transferred_to_human": s.transferred_to_human,
            "satisfaction": s.satisfaction,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "resolved_at": s.resolved_at.isoformat() if s.resolved_at else None,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def get_admin_stats(db: AsyncSession) -> Dict:
    """管理员统计数据"""
    # 总对话数
    total_result = await db.execute(select(func.count(ChatSession.id)))
    total = total_result.scalar() or 0

    # 已解决数
    resolved_result = await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.status == "resolved")
    )
    resolved = resolved_result.scalar() or 0

    # 转人工数
    transferred_result = await db.execute(
        select(func.count(ChatSession.id)).where(ChatSession.status == "transferred")
    )
    transferred = transferred_result.scalar() or 0

    # 平均满意度
    sat_result = await db.execute(
        select(func.avg(ChatSession.satisfaction)).where(ChatSession.satisfaction.isnot(None))
    )
    avg_satisfaction = sat_result.scalar()
    if avg_satisfaction:
        avg_satisfaction = round(float(avg_satisfaction), 1)

    # 今日对话数
    today = datetime.now().date()
    today_result = await db.execute(
        select(func.count(ChatSession.id)).where(
            func.date(ChatSession.created_at) == today
        )
    )
    today_count = today_result.scalar() or 0

    return {
        "total_sessions": total,
        "resolved": resolved,
        "transferred": transferred,
        "resolve_rate": round(resolved / total * 100, 1) if total > 0 else 0,
        "transfer_rate": round(transferred / total * 100, 1) if total > 0 else 0,
        "avg_satisfaction": avg_satisfaction,
        "today_sessions": today_count,
    }


# ===== 内部方法 =====

async def _build_ai_messages(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    knowledge_results: List[Dict],
    config: Dict,
) -> List[dict]:
    """构建发送给 AI 的消息列表"""
    messages = []

    # 系统提示词
    system_prompt = """你是亚马逊赛训效率工具箱的智能客服助手。
你的职责是帮助用户解决安装、使用、授权等方面的问题。

回答规则：
1. 基于提供的知识库内容回答，不要编造信息
2. 如果知识库中没有相关内容，诚实告知用户，并建议转人工客服
3. 回答要简洁、清晰、有条理
4. 涉及退款、投诉等敏感问题，建议用户联系人工客服
5. 如果用户的问题涉及账号查询、授权状态等需要后台数据的操作，建议转人工客服
"""

    # 添加知识库上下文
    if knowledge_results:
        knowledge_context = "\n\n---\n\n".join([
            f"【{r['title']}】(分类: {r['category']}, 相关度: {r['score']})\n{r['content']}"
            for r in knowledge_results[:3]
        ])
        system_prompt += f"\n\n以下是与用户问题相关的知识库内容，请优先参考这些内容回答：\n\n{knowledge_context}"

    messages.append({"role": "system", "content": system_prompt})

    # 添加对话历史
    history_count = settings.AI_CHAT_MAX_HISTORY
    messages_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .where(ChatMessage.role.in_(["user", "ai"]))
        .order_by(ChatMessage.created_at.desc())
        .limit(history_count * 2)
    )
    history_messages = messages_result.scalars().all()

    # 反转顺序（从旧到新）
    history_messages = list(reversed(history_messages))

    for m in history_messages:
        messages.append({
            "role": "assistant" if m.role == "ai" else "user",
            "content": m.content,
        })

    # 当前用户消息
    messages.append({"role": "user", "content": user_message})

    return messages


def _message_to_dict(msg: ChatMessage) -> Dict:
    """消息转字典"""
    knowledge_ids = []
    if msg.knowledge_ids:
        try:
            knowledge_ids = json.loads(msg.knowledge_ids)
        except (json.JSONDecodeError, TypeError):
            knowledge_ids = []

    return {
        "role": msg.role,
        "content": msg.content,
        "knowledge_ids": knowledge_ids,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }