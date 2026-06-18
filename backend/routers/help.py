"""
帮助查询路由模块
实现 FAQ 优先 + AI 兜底的智能问答逻辑
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import json

from database import get_db
from models import KnowledgeBase
from core.logging import get_logger
from core.dependencies import get_current_user
from core.response import success_response, error_response

logger = get_logger(__name__)

router = APIRouter()


@router.post("/query")
async def query_help(
    request: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    智能帮助查询 - FAQ 优先，AI 兜底
    
    请求参数:
    - platform_key: 平台标识 (amazon/aliexpress)
    - capability_key: 功能标识 (register/logistics_template/listing/ads/shipping/fba_agl)
    - question: 用户问题
    
    返回:
    - matched: 是否匹配到 FAQ
    - ai_used: 是否使用了 AI
    - source: 答案来源 (faq/ai)
    - answer: 答案内容
    - faq_id: FAQ ID (如果匹配)
    - need_ai: 是否需要 AI 兜底
    """
    platform_key = request.get("platform_key", "amazon")
    capability_key = request.get("capability_key")
    question = request.get("question", "").strip()
    
    if not question:
        return error_response("问题不能为空")
    
    logger.info(f"帮助查询: platform={platform_key}, capability={capability_key}, question={question[:50]}")
    
    # 1. 尝试匹配 FAQ
    faq_result = await _match_faq(db, platform_key, capability_key, question)
    
    if faq_result:
        # 匹配到 FAQ，直接返回
        return success_response({
            "matched": True,
            "ai_used": False,
            "source": "faq",
            "answer": faq_result["content"],
            "faq_id": faq_result["id"],
            "faq_title": faq_result["title"],
            "need_ai": False
        })
    
    # 2. 未匹配到 FAQ，返回需要 AI 兜底
    return success_response({
        "matched": False,
        "ai_used": False,
        "source": None,
        "answer": None,
        "faq_id": None,
        "faq_title": None,
        "need_ai": True,
        "message": "FAQ 暂未命中，是否使用 AI 诊断？"
    })


async def _match_faq(
    db: AsyncSession,
    platform_key: str,
    capability_key: Optional[str],
    question: str
) -> Optional[dict]:
    """
    匹配 FAQ
    
    匹配优先级:
    1. 当前平台 + 当前功能
    2. 当前平台通用
    3. 全平台 + 当前功能
    4. 全平台通用
    """
    # 提取关键词（简单实现：按空格分词）
    keywords = question.lower().split()
    
    # 构建查询条件
    conditions = [
        KnowledgeBase.status == "active"
    ]
    
    # 平台条件：当前平台或全平台
    platform_condition = or_(
        KnowledgeBase.platform_key == platform_key,
        KnowledgeBase.platform_key.is_(None)
    )
    conditions.append(platform_condition)
    
    # 功能条件：如果有 capability_key，优先匹配
    if capability_key:
        capability_condition = or_(
            KnowledgeBase.capability_key == capability_key,
            KnowledgeBase.capability_key.is_(None)
        )
        conditions.append(capability_condition)
    
    # 查询所有匹配的 FAQ
    query = select(KnowledgeBase).where(and_(*conditions))
    query = query.order_by(
        # 优先级排序：精确匹配 > 平台匹配 > 通用
        KnowledgeBase.platform_key.is_(None),
        KnowledgeBase.capability_key.is_(None),
        KnowledgeBase.priority.desc()
    )
    
    result = await db.execute(query)
    faqs = result.scalars().all()
    
    if not faqs:
        return None
    
    # 关键词匹配评分
    best_match = None
    best_score = 0
    
    for faq in faqs:
        score = 0
        
        # 标题匹配
        title_lower = faq.title.lower()
        for keyword in keywords:
            if keyword in title_lower:
                score += 2
        
        # 内容匹配
        content_lower = faq.content.lower()
        for keyword in keywords:
            if keyword in content_lower:
                score += 1
        
        # 关键词匹配
        if faq.keywords:
            try:
                faq_keywords = json.loads(faq.keywords) if isinstance(faq.keywords, str) else faq.keywords
                for keyword in keywords:
                    for faq_kw in faq_keywords:
                        if keyword in faq_kw.lower() or faq_kw.lower() in keyword:
                            score += 3
            except:
                pass
        
        # 优先级加权
        if faq.priority == "high":
            score *= 1.5
        elif faq.priority == "medium":
            score *= 1.2
        
        if score > best_score:
            best_score = score
            best_match = faq
    
    # 最低匹配阈值
    if best_score >= 2:
        return {
            "id": best_match.id,
            "title": best_match.title,
            "content": best_match.content
        }
    
    return None


@router.get("/faq/list")
async def get_faq_list(
    platform_key: Optional[str] = None,
    capability_key: Optional[str] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    获取 FAQ 列表
    
    支持按平台、功能、分类筛选
    """
    conditions = [KnowledgeBase.status == "active"]
    
    if platform_key:
        conditions.append(
            or_(
                KnowledgeBase.platform_key == platform_key,
                KnowledgeBase.platform_key.is_(None)
            )
        )
    
    if capability_key:
        conditions.append(
            or_(
                KnowledgeBase.capability_key == capability_key,
                KnowledgeBase.capability_key.is_(None)
            )
        )
    
    if category:
        conditions.append(KnowledgeBase.category == category)
    
    query = select(KnowledgeBase).where(and_(*conditions))
    query = query.order_by(
        KnowledgeBase.priority.desc(),
        KnowledgeBase.created_at.desc()
    )
    
    result = await db.execute(query)
    faqs = result.scalars().all()
    
    return success_response({
        "total": len(faqs),
        "items": [
            {
                "id": faq.id,
                "category": faq.category,
                "title": faq.title,
                "content": faq.content,
                "keywords": json.loads(faq.keywords) if faq.keywords and isinstance(faq.keywords, str) else faq.keywords,
                "priority": faq.priority,
                "platform_key": faq.platform_key,
                "capability_key": faq.capability_key,
                "view_count": faq.view_count,
                "created_at": faq.created_at.isoformat() if faq.created_at else None
            }
            for faq in faqs
        ]
    })