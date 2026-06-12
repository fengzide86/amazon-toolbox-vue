"""
工具配置路由模块
包含工具配置的查询、更新等接口
支持工具分类和搜索功能
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import json

from database import get_db
from models import Setting
from core.logging import get_logger
from core.dependencies import get_current_admin

logger = get_logger(__name__)

router = APIRouter()


# 默认工具分类
DEFAULT_CATEGORIES = [
    {"id": "all", "name": "全部工具", "sort_order": 0},
    {"id": "data", "name": "数据分析", "sort_order": 1},
    {"id": "operation", "name": "运营工具", "sort_order": 2},
    {"id": "automation", "name": "自动化工具", "sort_order": 3},
    {"id": "other", "name": "其他工具", "sort_order": 4},
]


@router.get("/categories")
async def get_tool_categories(db: AsyncSession = Depends(get_db)):
    """获取工具分类列表"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_categories"))
    setting = result.scalars().first()
    if setting and setting.value:
        return json.loads(setting.value)
    return DEFAULT_CATEGORIES


@router.get("")
async def get_tools(
    category: Optional[str] = Query(None, description="分类ID"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db)
):
    """获取工具配置列表，支持分类和搜索筛选"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalars().first()
    
    tools = []
    if setting and setting.value:
        tools = json.loads(setting.value)
    
    # 分类筛选
    if category and category != "all":
        tools = [t for t in tools if t.get("category") == category]
    
    # 搜索筛选
    if search:
        search_lower = search.lower()
        tools = [t for t in tools if 
                 search_lower in t.get("name", "").lower() or 
                 search_lower in t.get("module", "").lower() or
                 search_lower in t.get("description", "").lower()]
    
    return tools


@router.put("")
async def update_tools(tools: list, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新工具配置"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalars().first()
    
    tools_json = json.dumps(tools, ensure_ascii=False)
    
    if setting:
        setting.value = tools_json
    else:
        setting = Setting(key="tool_configs", value=tools_json)
        db.add(setting)
    
    await db.commit()
    logger.info("工具配置已更新")
    return {"success": True}


@router.put("/categories")
async def update_tool_categories(categories: list, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新工具分类配置"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_categories"))
    setting = result.scalars().first()
    
    categories_json = json.dumps(categories, ensure_ascii=False)
    
    if setting:
        setting.value = categories_json
    else:
        setting = Setting(key="tool_categories", value=categories_json)
        db.add(setting)
    
    await db.commit()
    logger.info("工具分类配置已更新")
    return {"success": True}
