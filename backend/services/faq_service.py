"""无需调用大模型的 FAQ 本地匹配服务。"""
import json
import re
from typing import Dict, Optional, Set

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import KnowledgeBase


def _normalize(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", (text or "").lower())


def _tokens(text: str) -> Set[str]:
    normalized = _normalize(text)
    latin = set(re.findall(r"[a-z0-9_-]{2,}", (text or "").lower()))
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", normalized))
    grams = {chinese[i:i + 2] for i in range(max(0, len(chinese) - 1))}
    return latin | grams


async def match_faq(
    db: AsyncSession,
    question: str,
    platform_key: str = None,
    capability_key: str = None,
) -> Optional[Dict]:
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
    question_tokens = _tokens(question)
    best = None
    best_score = 0.0
    for item in result.scalars().all():
        title = _normalize(item.title)
        try:
            keywords = json.loads(item.keywords) if item.keywords else []
        except (json.JSONDecodeError, TypeError):
            keywords = []

        score = 0.0
        if len(title) >= 3 and (title in question_normalized or question_normalized in title):
            score += 8
        for keyword in keywords:
            keyword_normalized = _normalize(str(keyword))
            if len(keyword_normalized) >= 2 and keyword_normalized in question_normalized:
                score += 5
        score += min(len(question_tokens & _tokens(item.title)), 3) * 2
        score += min(len(question_tokens & _tokens(item.content)), 3) * 0.5
        score *= {"high": 1.15, "low": 0.9}.get(item.priority, 1.0)
        if score > best_score:
            best, best_score = item, score

    if not best or best_score < 4:
        return None
    return {
        "id": best.id,
        "knowledge_id": best.id,
        "title": best.title,
        "category": best.category,
        "content": best.content,
        "score": round(min(best_score / 10, 1.0), 4),
        "platform_key": best.platform_key,
        "capability_key": best.capability_key,
    }
