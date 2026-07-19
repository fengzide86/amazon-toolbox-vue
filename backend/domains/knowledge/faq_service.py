"""无需调用大模型的 FAQ 本地匹配服务。"""
import json
import re
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import KnowledgeBase


def _normalize(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", (text or "").lower())


async def match_faq(
    db: AsyncSession,
    question: str,
    platform_key: str | None = None,
    capability_key: str | None = None,
) -> dict[str, Any] | None:
    """按平台/功能过滤后使用标题、配置关键词和中文二元组匹配 FAQ。"""
    question_normalized = _normalize(question)
    if not question_normalized:
        return None

    conditions = [KnowledgeBase.status == "active"]
    if platform_key:
        conditions.append(or_(KnowledgeBase.platform_key == platform_key, KnowledgeBase.platform_key.is_(None), KnowledgeBase.platform_key == ""))
    if capability_key:
        conditions.append(or_(KnowledgeBase.capability_key == capability_key, KnowledgeBase.capability_key.is_(None), KnowledgeBase.capability_key == ""))

    result = await db.execute(select(KnowledgeBase).where(and_(*conditions)))
    best = None
    best_key: tuple[int, int, int] | None = None
    best_score = 0.0
    for item in result.scalars().all():
        title = _normalize(item.title)
        try:
            keywords = json.loads(item.keywords) if item.keywords else []
        except (json.JSONDecodeError, TypeError):
            keywords = []

        normalized_keywords = [
            normalized
            for keyword in keywords
            if (normalized := _normalize(str(keyword)))
        ]

        # Match tiers are deliberately deterministic: exact question/title,
        # exact keyword, contained keyword, then contained title.
        match_level = 0
        if title and title == question_normalized:
            match_level = 5
        elif question_normalized in normalized_keywords:
            match_level = 4
        elif any(len(keyword) >= 2 and keyword in question_normalized for keyword in normalized_keywords):
            match_level = 3
        elif len(title) >= 3 and (title in question_normalized or question_normalized in title):
            match_level = 2

        if match_level == 0:
            continue

        priority = {"high": 3, "medium": 2, "low": 1}.get(item.priority, 2)
        candidate_key = (match_level, priority, item.id or 0)
        if best_key is None or candidate_key > best_key:
            best, best_key = item, candidate_key
            best_score = match_level / 5

    if not best:
        return None
    return {
        "id": best.id,
        "knowledge_id": best.id,
        "title": best.title,
        "category": best.category,
        "content": best.content,
        "score": round(best_score, 4),
        "platform_key": best.platform_key,
        "capability_key": best.capability_key,
    }
