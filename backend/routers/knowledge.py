"""
知识库管理路由模块
提供知识库 CRUD、批量导入、向量同步等 API
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pydantic import BaseModel

from database import get_db
from core.dependencies import get_current_admin
from core.audit import log_admin_action
from services import knowledge_service

router = APIRouter()


# ===== 请求体模型 =====

class KnowledgeCreate(BaseModel):
    category: str
    title: str
    content: str
    keywords: Optional[List[str]] = None
    priority: Optional[str] = "medium"
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None


class KnowledgeUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    keywords: Optional[List[str]] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    platform_key: Optional[str] = None
    capability_key: Optional[str] = None


class BatchImportItem(BaseModel):
    category: str
    title: str
    content: str
    keywords: Optional[List[str]] = None
    priority: Optional[str] = "medium"


# ===== 路由 =====

@router.get("")
async def get_knowledge_list(
    category: Optional[str] = Query(None, description="分类过滤"),
    status: Optional[str] = Query(None, description="状态过滤"),
    keyword: Optional[str] = Query(None, description="关键词搜索"),
    platform_key: Optional[str] = Query(None, description="平台标识 (amazon/aliexpress)"),
    capability_key: Optional[str] = Query(None, description="功能标识"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取知识库列表（分页）"""
    return await knowledge_service.get_list(
        db, category=category, status=status, keyword=keyword,
        platform_key=platform_key, capability_key=capability_key,
        page=page, page_size=page_size
    )


@router.get("/categories")
async def get_categories(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取分类列表及数量"""
    return await knowledge_service.get_categories(db)


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取知识库统计"""
    return await knowledge_service.get_stats(db)


@router.get("/{knowledge_id}")
async def get_knowledge(
    knowledge_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """获取知识条目详情"""
    item = await knowledge_service.get_by_id(db, knowledge_id)
    if not item:
        raise HTTPException(status_code=404, detail="知识条目不存在")
    return item


@router.post("")
async def create_knowledge(
    req: KnowledgeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """新建知识条目"""
    result = await knowledge_service.create(
        db,
        category=req.category,
        title=req.title,
        content=req.content,
        keywords=req.keywords,
        priority=req.priority,
        platform_key=req.platform_key,
        capability_key=req.capability_key,
    )
    
    # 审计日志
    await log_admin_action(
        db,
        user_id=_admin.get("user_id"),
        user_name=_admin.get("name", "admin"),
        action="create_knowledge",
        target_type="knowledge",
        target_id=result.id if result else None,
        detail={"title": req.title, "category": req.category},
        request=request,
    )
    await db.commit()
    
    return result


@router.put("/{knowledge_id}")
async def update_knowledge(
    knowledge_id: int,
    req: KnowledgeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """更新知识条目"""
    item = await knowledge_service.update(
        db, knowledge_id,
        category=req.category,
        title=req.title,
        content=req.content,
        keywords=req.keywords,
        priority=req.priority,
        status=req.status,
        platform_key=req.platform_key,
        capability_key=req.capability_key,
    )
    if not item:
        raise HTTPException(status_code=404, detail="知识条目不存在")
    
    # 审计日志
    await log_admin_action(
        db,
        user_id=_admin.get("user_id"),
        user_name=_admin.get("name", "admin"),
        action="update_knowledge",
        target_type="knowledge",
        target_id=knowledge_id,
        detail={"title": req.title, "changes": req.model_dump(exclude_none=True)},
        request=request,
    )
    await db.commit()
    
    return item


@router.delete("/{knowledge_id}")
async def delete_knowledge(
    knowledge_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """删除知识条目"""
    # 先获取标题用于审计日志
    item = await knowledge_service.get_by_id(db, knowledge_id)
    title = item.title if item else None
    
    success = await knowledge_service.delete(db, knowledge_id)
    if not success:
        raise HTTPException(status_code=404, detail="知识条目不存在")
    
    # 审计日志
    await log_admin_action(
        db,
        user_id=_admin.get("user_id"),
        user_name=_admin.get("name", "admin"),
        action="delete_knowledge",
        target_type="knowledge",
        target_id=knowledge_id,
        detail={"title": title},
        request=request,
    )
    await db.commit()
    
    return {"message": "删除成功"}


@router.post("/batch-import")
async def batch_import(
    items: List[BatchImportItem],
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """批量导入知识条目"""
    data = [item.model_dump() for item in items]
    return await knowledge_service.batch_import(db, data)


@router.post("/sync-vector")
async def sync_to_vector(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """全量同步知识库到向量库"""
    return await knowledge_service.sync_all_to_vector(db)