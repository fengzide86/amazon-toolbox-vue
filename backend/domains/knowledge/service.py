"""
知识库服务
处理知识库 CRUD、向量同步等业务逻辑
"""
import json
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.logging import get_logger
from models import KnowledgeBase

logger = get_logger(__name__)


async def get_list(
    db: AsyncSession,
    category: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    platform_key: str | None = None,
    capability_key: str | None = None,
    page: int = 1,
    page_size: int = 20
) -> dict[str, Any]:
    """获取知识库列表（分页）"""
    query = select(KnowledgeBase)
    count_query = select(func.count(KnowledgeBase.id))

    if category:
        query = query.where(KnowledgeBase.category == category)
        count_query = count_query.where(KnowledgeBase.category == category)
    if status:
        query = query.where(KnowledgeBase.status == status)
        count_query = count_query.where(KnowledgeBase.status == status)
    if platform_key:
        from sqlalchemy import or_
        platform_cond = or_(
            KnowledgeBase.platform_key == platform_key,
            KnowledgeBase.platform_key.is_(None)
        )
        query = query.where(platform_cond)
        count_query = count_query.where(platform_cond)
    if capability_key:
        from sqlalchemy import or_
        cap_cond = or_(
            KnowledgeBase.capability_key == capability_key,
            KnowledgeBase.capability_key.is_(None)
        )
        query = query.where(cap_cond)
        count_query = count_query.where(cap_cond)
    if keyword:
        like_pattern = f"%{keyword}%"
        query = query.where(
            (KnowledgeBase.title.ilike(like_pattern)) |
            (KnowledgeBase.content.ilike(like_pattern)) |
            (KnowledgeBase.keywords.ilike(like_pattern))
        )
        count_query = count_query.where(
            (KnowledgeBase.title.ilike(like_pattern)) |
            (KnowledgeBase.content.ilike(like_pattern)) |
            (KnowledgeBase.keywords.ilike(like_pattern))
        )

    # 总数
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 分页查询
    query = query.order_by(
        # 高优先级在前，同优先级按更新时间倒序
        KnowledgeBase.priority == "high",
        KnowledgeBase.updated_at.desc()
    ).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    serialized = [_knowledge_to_dict(item) for item in items]
    return {
        "data": serialized,
        # Compatibility alias for clients shipped before the standard list contract.
        "items": serialized,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_by_id(db: AsyncSession, knowledge_id: int) -> dict[str, Any] | None:
    """根据ID获取知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if item:
        return _knowledge_to_dict(item)
    return None


async def create(
    db: AsyncSession,
    category: str,
    title: str,
    content: str,
    keywords: list[str] | None = None,
    priority: str = "medium",
    platform_key: str | None = None,
    capability_key: str | None = None,
    actor: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    """创建知识条目"""
    item = KnowledgeBase(
        category=category,
        title=title,
        content=content,
        keywords=json.dumps(keywords or [], ensure_ascii=False),
        priority=priority,
        status="active",
        platform_key=platform_key,
        capability_key=capability_key,
    )
    db.add(item)
    await db.flush()
    if actor:
        await log_admin_action(
            db,
            user_id=actor.get("staff_id"),
            user_name=actor.get("username"),
            action="create_knowledge",
            target_type="knowledge",
            target_id=item.id,
            detail={
                "role": actor.get("role"),
                "before": None,
                "after": _knowledge_to_dict(item),
                "reason": None,
            },
            request=request,
        )
    await db.commit()
    await db.refresh(item)

    return _knowledge_to_dict(item)


async def update(
    db: AsyncSession,
    knowledge_id: int,
    category: str | None = None,
    title: str | None = None,
    content: str | None = None,
    keywords: list[str] | None = None,
    priority: str | None = None,
    status: str | None = None,
    platform_key: str | None = None,
    capability_key: str | None = None,
    actor: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict[str, Any] | None:
    """更新知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return None

    before = _knowledge_to_dict(item)

    if category is not None:
        item.category = category
    if title is not None:
        item.title = title
    if content is not None:
        item.content = content
    if keywords is not None:
        item.keywords = json.dumps(keywords, ensure_ascii=False)
    if priority is not None:
        item.priority = priority
    if status is not None:
        item.status = status
    if platform_key is not None:
        item.platform_key = platform_key
    if capability_key is not None:
        item.capability_key = capability_key

    # Internal builds use deterministic FAQ/rule matching only.  Clear legacy
    # vector identifiers so operators never mistake this record for a synced
    # external-AI entry.
    if item.vector_id is not None:
        item.vector_id = None

    if actor:
        await log_admin_action(
            db,
            user_id=actor.get("staff_id"),
            user_name=actor.get("username"),
            action="update_knowledge",
            target_type="knowledge",
            target_id=item.id,
            detail={
                "role": actor.get("role"),
                "before": before,
                "after": _knowledge_to_dict(item),
                "reason": None,
            },
            request=request,
        )
    await db.commit()

    return _knowledge_to_dict(item)


async def delete(
    db: AsyncSession,
    knowledge_id: int,
    actor: dict[str, Any] | None = None,
    request: Request | None = None,
) -> bool:
    """删除知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return False

    before = _knowledge_to_dict(item)
    await db.delete(item)
    if actor:
        await log_admin_action(
            db,
            user_id=actor.get("staff_id"),
            user_name=actor.get("username"),
            action="delete_knowledge",
            target_type="knowledge",
            target_id=item.id,
            detail={
                "role": actor.get("role"),
                "before": before,
                "after": {"deleted": True},
                "reason": None,
            },
            request=request,
        )
    await db.commit()
    return True


async def batch_import(
    db: AsyncSession,
    items: list[dict[str, Any]],
    actor: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    """批量导入知识条目"""
    success = 0
    failed = 0
    errors = []

    for idx, data in enumerate(items):
        try:
            await create(
                db=db,
                category=data.get("category", "其他"),
                title=data.get("title", ""),
                content=data.get("content", ""),
                keywords=data.get("keywords", []),
                priority=data.get("priority", "medium"),
                platform_key=data.get("platform_key"),
                capability_key=data.get("capability_key"),
                actor=actor,
                request=request,
            )
            success += 1
        except Exception as e:
            failed += 1
            errors.append(f"第{idx + 1}条: {str(e)}")
            logger.error(f"批量导入第{idx + 1}条失败: {e}")

    return {"success": success, "failed": failed, "errors": errors}


async def get_categories(db: AsyncSession) -> list[dict[str, Any]]:
    """获取分类列表及数量"""
    result = await db.execute(
        select(
            KnowledgeBase.category,
            func.count(KnowledgeBase.id)
        ).where(
            KnowledgeBase.status == "active"
        ).group_by(KnowledgeBase.category)
    )
    return [{"name": row[0], "count": row[1]} for row in result.all()]


async def get_stats(db: AsyncSession) -> dict[str, Any]:
    """获取知识库统计"""
    total_result = await db.execute(select(func.count(KnowledgeBase.id)))
    total = total_result.scalar() or 0

    active_result = await db.execute(
        select(func.count(KnowledgeBase.id)).where(KnowledgeBase.status == "active")
    )
    active = active_result.scalar() or 0

    category_result = await db.execute(
        select(func.count(func.distinct(KnowledgeBase.category)))
    )
    categories = category_result.scalar() or 0

    return {
        "total": total,
        "active": active,
        "categories": categories,
        "vector_store": {"enabled": False, "reason": "rules_mode"},
    }


async def sync_all_to_vector(db: AsyncSession) -> dict[str, Any]:
    """Vector synchronization is intentionally unavailable in rules mode."""
    del db
    raise RuntimeError("FEATURE_DISABLED: rules mode does not use a vector store")


def _knowledge_to_dict(item: KnowledgeBase) -> dict[str, Any]:
    """知识条目转字典"""
    keywords = []
    if item.keywords:
        try:
            keywords = json.loads(item.keywords)
        except (json.JSONDecodeError, TypeError):
            keywords = []

    return {
        "id": item.id,
        "category": item.category,
        "title": item.title,
        "content": item.content,
        "keywords": keywords,
        "priority": item.priority,
        "status": item.status,
        "vector_id": item.vector_id,
        "view_count": item.view_count or 0,
        "platform_key": getattr(item, 'platform_key', None),
        "capability_key": getattr(item, 'capability_key', None),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }
