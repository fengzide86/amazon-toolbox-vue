"""
AI 客服对话服务
处理会话管理、消息收发、向量检索、流式响应等
"""
import json
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.config import settings
from core.logging import get_logger
from models import ChatConfig, ChatMessage, ChatSession, Feedback, User

from . import faq_service

logger = get_logger(__name__)

# ===== AI 回退提示 =====
RULE_FALLBACK_REPLY = "暂时没有找到完全匹配的说明。你可以换一种说法再试一次，或直接转人工并保留当前问题。"

# ===== 敏感内容检测 =====
SENSITIVE_KEYWORDS = ["暴力", "色情", "赌博", "毒品", "诈骗", "政治敏感", "反动"]
SENSITIVE_CONTENT_REPLY = "工具帮助仅支持工具、授权、安装、报错和平台操作问题。如涉及其他问题，请提交工单联系人工客服。"


def _check_sensitive_content(message: str) -> bool:
    """
    检测敏感内容
    仅用于 AI 诊断输入和输出，不影响普通 FAQ 查询
    """
    if not message:
        return False
    message_lower = message.lower()
    return any(kw in message_lower for kw in SENSITIVE_KEYWORDS)


def _config_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    try:
        parsed = json.loads(value or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    return [str(item).strip() for item in parsed if str(item).strip()] if isinstance(parsed, list) else []

# 仅兼容系统曾经写入数据库的旧默认值；管理员自定义欢迎语不会被覆盖。
LEGACY_DEFAULT_WELCOME_MESSAGE = "你好！我是亚马逊工具箱智能客服 🤖\n请问有什么可以帮你的？"

# 默认配置
DEFAULT_CONFIG = {
    "welcome_message": "你好！我是课赛通 KST 智能客服 🤖\n请问有什么可以帮你的？",
    "suggested_questions": json.dumps([
        "如何安装工具箱？",
        "授权码怎么使用？",
        "脚本运行报错怎么办？",
        "物流模板怎么生成？",
        "套餐有什么区别？",
    ], ensure_ascii=False),
    "support_mode": "rules",
    "max_unmatched": "2",
    "transfer_keywords": json.dumps(["退款", "投诉", "人工", "账号异常"], ensure_ascii=False),
    "transfer_rules": json.dumps({
        "refund_direct_transfer": True,
        "complaint_direct_transfer": True,
        "auto_transfer_after_unmatched": True,
        "account_direct_transfer": False,
    }),
}


async def get_config(db: AsyncSession) -> dict[str, Any]:
    """获取AI客服配置"""
    result = await db.execute(select(ChatConfig))
    configs = result.scalars().all()

    config_dict = {}
    for c in configs:
        config_dict[c.key] = c.value

    # 合并默认配置
    merged = {}
    for key, default_val in DEFAULT_CONFIG.items():
        value = config_dict.get(key, default_val)
        if key == "welcome_message" and value == LEGACY_DEFAULT_WELCOME_MESSAGE:
            value = default_val
        merged[key] = value

    return merged


async def update_config(
    db: AsyncSession,
    updates: dict[str, Any],
    actor: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    """更新AI客服配置"""
    before = await get_config(db)
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

    after = {
        **before,
        **{key: value for key, value in updates.items() if key in DEFAULT_CONFIG},
    }
    if actor:
        await log_admin_action(
            db,
            user_id=actor.get("staff_id"),
            user_name=actor.get("username"),
            action="rules_support_config_update",
            target_type="chat_config",
            target_id="rules",
            detail={
                "role": actor.get("role"),
                "before": before,
                "after": after,
                "reason": None,
            },
            request=request,
        )
    await db.commit()
    return await get_config(db)


async def create_session(db: AsyncSession, user_id: int | None = None) -> dict[str, Any]:
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


async def get_session(db: AsyncSession, session_id: str) -> dict[str, Any] | None:
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


async def get_session_owner(db: AsyncSession, session_id: str) -> int | None:
    result = await db.execute(
        select(ChatSession.user_id).where(ChatSession.session_id == session_id)
    )
    return result.scalar_one_or_none()


async def get_session_record(db: AsyncSession, session_id: str) -> ChatSession | None:
    result = await db.execute(select(ChatSession).where(ChatSession.session_id == session_id))
    return result.scalar_one_or_none()


async def answer_question(
    db: AsyncSession,
    user_message: str,
    platform_key: str | None = None,
    capability_key: str | None = None,
    session_id: str | None = None,
    top_k: int = 5,
    min_score: float = 0.3,
) -> dict[str, Any]:
    """Answer exclusively from the local rule/FAQ knowledge base.

    No provider, embedding service or vector store is contacted in the
    internal build.  Keeping the response shape stable lets the existing
    clients migrate without pretending that a model was used.
    """
    started = time.perf_counter()
    config = await get_config(db)
    transfer_keywords = _config_list(config.get("transfer_keywords"))
    keyword_transfer = any(keyword in user_message for keyword in transfer_keywords)
    faq = await faq_service.match_faq(db, user_message, platform_key, capability_key)
    if faq:
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        return {
            "reply": faq["content"], "answer_mode": "faq", "ai_used": False,
            "knowledge_refs": [faq], "fallback_reason": None,
            "should_transfer": keyword_transfer,
            "diagnostics": {"retrieval_ms": elapsed, "generation_ms": 0, "total_ms": elapsed,
                            "provider": None, "model": None},
        }

    if _check_sensitive_content(user_message):
        return {
            "reply": SENSITIVE_CONTENT_REPLY, "answer_mode": "fallback", "ai_used": False,
            "knowledge_refs": [], "fallback_reason": "sensitive_content",
            "should_transfer": True,
            "diagnostics": {"total_ms": round((time.perf_counter() - started) * 1000, 2)},
        }

    try:
        max_unmatched = max(1, min(int(config.get("max_unmatched", 2)), 10))
    except (TypeError, ValueError):
        max_unmatched = 2
    previous_unmatched = 0
    if session_id and max_unmatched > 1:
        recent = (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id, ChatMessage.role == "ai")
                .order_by(ChatMessage.created_at.desc())
                .limit(max_unmatched - 1)
            )
        ).scalars().all()
        for message in recent:
            if message.knowledge_ids:
                break
            previous_unmatched += 1
    total_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "reply": RULE_FALLBACK_REPLY, "answer_mode": "fallback", "ai_used": False,
        "knowledge_refs": [], "fallback_reason": "no_rule_match",
        "should_transfer": keyword_transfer or previous_unmatched + 1 >= max_unmatched,
        "diagnostics": {
            "retrieval_ms": total_ms, "generation_ms": 0, "total_ms": total_ms,
            "provider": None, "model": None,
        },
    }


async def send_message(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    platform_key: str | None = None,
    capability_key: str | None = None,
) -> dict[str, Any]:
    """Persist one local rule/FAQ answer."""
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

    result = await answer_question(
        db, user_message, platform_key, capability_key, session_id=session_id
    )
    knowledge_ids = [str(r["id"]) for r in result["knowledge_refs"] if r.get("id")]
    ai_msg = ChatMessage(
        session_id=session_id,
        role="ai",
        content=result["reply"],
        knowledge_ids=json.dumps(knowledge_ids) if knowledge_ids else None,
    )
    db.add(ai_msg)
    await db.execute(
        sql_update(ChatSession)
        .where(ChatSession.session_id == session_id)
        .values(message_count=ChatSession.message_count + 1)
    )
    await db.commit()

    return {**result, "session_id": session_id}


async def send_message_stream(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    platform_key: str | None = None,
    capability_key: str | None = None,
) -> AsyncGenerator[str]:
    """Keep the SSE-compatible path without contacting an external model."""
    result = await send_message(
        db,
        session_id,
        user_message,
        platform_key=platform_key,
        capability_key=capability_key,
    )
    yield result["reply"]


async def resolve_session(db: AsyncSession, session_id: str, satisfaction: int | None = None) -> bool:
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


async def transfer_to_human(db: AsyncSession, session_id: str, user_id: int | None = None) -> int | None:
    """转人工 - 自动创建工单"""
    session = await get_session_record(db, session_id)
    if not session:
        return None

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
    content = "用户通过 AI 客服咨询后转人工。\n\n对话记录：\n" + "\n".join(chat_history)

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


async def get_user_history(db: AsyncSession, user_id: int, page: int = 1, page_size: int = 10) -> dict[str, Any]:
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

    items = [{
            "session_id": s.session_id,
            "status": s.status,
            "message_count": s.message_count,
            "ai_resolved": s.ai_resolved,
            "satisfaction": s.satisfaction,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        } for s in sessions]
    return {
        "data": items,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_admin_sessions(db: AsyncSession, status: str | None = None, page: int = 1, page_size: int = 20) -> dict[str, Any]:
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

    return {
        "data": items,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_admin_stats(db: AsyncSession) -> dict[str, Any]:
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
    session_id: str | None,
    user_message: str,
    knowledge_results: list[dict[str, Any]],
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    """构建发送给 AI 的消息列表"""
    messages = []

    # 系统提示词
    system_prompt = """你是课赛通 KST · 跨境电商赛训效率平台的智能客服助手。
你的职责是帮助用户解决安装、使用、授权等方面的问题。

回答规则：
1. 基于提供的知识库内容回答，不要编造信息
2. 如果知识库中没有相关内容，诚实告知用户，并建议转人工客服
3. 回答要简洁、清晰、有条理
4. 涉及退款、投诉等敏感问题，建议用户联系人工客服
5. 如果用户的问题涉及账号查询、授权状态等需要后台数据的操作，建议转人工客服
"""
    reply_style = config.get("reply_style", "concise")
    style_instruction = {
        "concise": "回答尽量简洁，优先给出可执行步骤。",
        "detailed": "回答可以详细解释原因，并给出分步骤操作。",
        "friendly": "使用友好但专业的语气回答。",
    }.get(reply_style, "回答应清晰、准确。")
    system_prompt += f"\n6. {style_instruction}"

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
    history_messages = []
    if session_id:
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
    if history_messages and history_messages[-1].role == "user" and history_messages[-1].content == user_message:
        history_messages = history_messages[:-1]

    for m in history_messages:
        messages.append({
            "role": "assistant" if m.role == "ai" else "user",
            "content": m.content,
        })

    # 当前用户消息
    messages.append({"role": "user", "content": user_message})

    return messages


def _message_to_dict(msg: ChatMessage) -> dict[str, Any]:
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
