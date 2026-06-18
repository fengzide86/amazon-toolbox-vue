"""
知识库服务
处理知识库 CRUD、向量同步等业务逻辑
"""
import json
from typing import List, Optional, Dict, Any
from sqlalchemy import select, func, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from models import KnowledgeBase
from services import vector_store, ai_provider
from core.logging import get_logger

logger = get_logger(__name__)


async def get_list(
    db: AsyncSession,
    category: str = None,
    status: str = None,
    keyword: str = None,
    platform_key: str = None,
    capability_key: str = None,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
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

    return {
        "items": [_knowledge_to_dict(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_by_id(db: AsyncSession, knowledge_id: int) -> Optional[Dict]:
    """根据ID获取知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if item:
        # 增加查看次数
        item.view_count = (item.view_count or 0) + 1
        await db.commit()
        return _knowledge_to_dict(item)
    return None


async def create(
    db: AsyncSession,
    category: str,
    title: str,
    content: str,
    keywords: List[str] = None,
    priority: str = "medium",
    platform_key: str = None,
    capability_key: str = None,
) -> Dict:
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
    await db.commit()
    await db.refresh(item)

    # 同步到向量库
    try:
        embedding = await ai_provider.get_embedding(f"{title}\n{content}")
        if embedding:
            vector_id = await vector_store.add_knowledge(
                knowledge_id=item.id,
                title=title,
                content=content,
                category=category,
                keywords=keywords,
                priority=priority,
                embedding=embedding,
            )
            item.vector_id = vector_id
            await db.commit()
            await db.refresh(item)
    except Exception as e:
        logger.warning(f"同步向量库失败（不影响创建）: {e}")

    return _knowledge_to_dict(item)


async def update(
    db: AsyncSession,
    knowledge_id: int,
    category: str = None,
    title: str = None,
    content: str = None,
    keywords: List[str] = None,
    priority: str = None,
    status: str = None,
    platform_key: str = None,
    capability_key: str = None,
) -> Optional[Dict]:
    """更新知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return None

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

    await db.commit()

    # 同步到向量库
    try:
        embedding = await ai_provider.get_embedding(f"{item.title}\n{item.content}")
        if item.vector_id:
            await vector_store.update_knowledge(
                knowledge_id=item.id,
                title=item.title,
                content=item.content,
                category=item.category,
                keywords=json.loads(item.keywords) if item.keywords else None,
                priority=item.priority,
                embedding=embedding,
            )
        elif embedding:
            vector_id = await vector_store.add_knowledge(
                knowledge_id=item.id,
                title=item.title,
                content=item.content,
                category=item.category,
                keywords=json.loads(item.keywords) if item.keywords else None,
                priority=item.priority,
                embedding=embedding,
            )
            item.vector_id = vector_id
            await db.commit()
    except Exception as e:
        logger.warning(f"同步向量库失败（不影响更新）: {e}")

    return _knowledge_to_dict(item)


async def delete(db: AsyncSession, knowledge_id: int) -> bool:
    """删除知识条目"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        return False

    # 从向量库删除
    try:
        await vector_store.delete_knowledge(knowledge_id)
    except Exception as e:
        logger.warning(f"从向量库删除失败: {e}")

    await db.delete(item)
    await db.commit()
    return True


async def batch_import(db: AsyncSession, items: List[Dict]) -> Dict:
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
            )
            success += 1
        except Exception as e:
            failed += 1
            errors.append(f"第{idx + 1}条: {str(e)}")
            logger.error(f"批量导入第{idx + 1}条失败: {e}")

    return {"success": success, "failed": failed, "errors": errors}


async def get_categories(db: AsyncSession) -> List[Dict]:
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


async def get_stats(db: AsyncSession) -> Dict:
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

    vector_stats = await vector_store.get_stats()

    return {
        "total": total,
        "active": active,
        "categories": categories,
        "vector_store": vector_stats,
    }


async def sync_all_to_vector(db: AsyncSession) -> Dict:
    """全量同步知识库到向量库"""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.status == "active")
    )
    items = result.scalars().all()

    knowledge_items = []
    for item in items:
        knowledge_items.append({
            "id": item.id,
            "title": item.title,
            "content": item.content,
            "category": item.category,
            "keywords": json.loads(item.keywords) if item.keywords else [],
            "priority": item.priority,
        })

    await vector_store.sync_all(knowledge_items, embed_fn=ai_provider.get_embedding)

    # 更新所有条目的 vector_id
    for item in items:
        item.vector_id = f"knowledge_{item.id}"
    await db.commit()

    return {"synced": len(items)}


def _knowledge_to_dict(item: KnowledgeBase) -> Dict:
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
