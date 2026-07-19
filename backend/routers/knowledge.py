"""
知识库管理路由模块
提供规则式知识库 CRUD 与批量导入 API
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from domains.knowledge import service as knowledge_service

router = APIRouter()


# ===== 请求体模型 =====

class KnowledgeCreate(BaseModel):
    category: str
    title: str
    content: str
    keywords: list[str] | None = None
    priority: str | None = "medium"
    platform_key: str | None = None
    capability_key: str | None = None


class KnowledgeUpdate(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None
    keywords: list[str] | None = None
    priority: str | None = None
    status: str | None = None
    platform_key: str | None = None
    capability_key: str | None = None


class BatchImportItem(BaseModel):
    category: str
    title: str
    content: str
    keywords: list[str] | None = None
    priority: str | None = "medium"


class RetrievalTestRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    platform_key: str | None = None
    capability_key: str | None = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.3, ge=-1, le=1)


# ===== 路由 =====

@router.post("/retrieval-test")
async def retrieval_test(
    req: RetrievalTestRequest,
    _admin: dict = Depends(get_current_admin),
):
    """Vector retrieval is not part of the internal rules build."""
    del req, _admin
    raise HTTPException(
        status_code=409,
        detail={"code": "FEATURE_DISABLED", "message": "当前为规则式客服模式"},
    )

@router.get("")
async def get_knowledge_list(
    category: str | None = Query(None, description="分类过滤"),
    status: str | None = Query(None, description="状态过滤"),
    keyword: str | None = Query(None, description="关键词搜索"),
    platform_key: str | None = Query(None, description="平台标识 (amazon/aliexpress)"),
    capability_key: str | None = Query(None, description="功能标识"),
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


@router.get("/{knowledge_id:int}")
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
        actor=_admin,
        request=request,
    )

    return result


@router.put("/{knowledge_id:int}")
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
        actor=_admin,
        request=request,
    )
    if not item:
        raise HTTPException(status_code=404, detail="知识条目不存在")

    return item


@router.delete("/{knowledge_id:int}")
async def delete_knowledge(
    knowledge_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """删除知识条目"""
    success = await knowledge_service.delete(
        db,
        knowledge_id,
        actor=_admin,
        request=request,
    )
    if not success:
        raise HTTPException(status_code=404, detail="知识条目不存在")

    return {"message": "删除成功"}


@router.post("/batch-import")
async def batch_import(
    items: list[BatchImportItem],
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_current_admin),
):
    """批量导入知识条目"""
    data = [item.model_dump() for item in items]
    return await knowledge_service.batch_import(db, data, actor=actor, request=request)


@router.post("/sync-vector")
async def sync_to_vector(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    """Vector synchronization is disabled in rules mode."""
    del db, _admin
    raise HTTPException(
        status_code=409,
        detail={"code": "FEATURE_DISABLED", "message": "当前为规则式客服模式"},
    )
