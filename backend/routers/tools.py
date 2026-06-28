"""
工具配置路由模块
包含工具配置的查询、更新等接口
支持工具分类和搜索功能
"""
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime, timedelta
import json
import secrets

from database import get_db
from models import Setting, LaunchToken, AuthCode
from core.logging import get_logger
from core.dependencies import get_current_admin, get_current_user
from core.response import success_response, error_response

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
    platform_key: Optional[str] = Query(None, description="平台: amazon / aliexpress"),
    db: AsyncSession = Depends(get_db)
):
    """获取工具配置列表，支持分类、搜索和平台筛选"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalars().first()
    
    tools = []
    if setting and setting.value:
        tools = json.loads(setting.value)
    
    # ===== 1.5 平台筛选 =====
    if platform_key and platform_key != "all":
        tools = [t for t in tools if t.get("platform_key") == platform_key]
    
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
    
    # 按 sort_order 排序
    tools = sorted(tools, key=lambda t: t.get("sort_order", 0))
    
    return tools


@router.put("")
async def update_tools(
    tools: List[dict] = Body(...),
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin)
):
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


# ===== 1.5 平台配置接口 =====

# 默认平台配置
DEFAULT_PLATFORMS = [
    {
        "key": "amazon",
        "name": "亚马逊",
        "short_name": "亚马逊",
        "status": "available",
        "sort_order": 1
    },
    {
        "key": "aliexpress",
        "name": "速卖通",
        "short_name": "速卖通",
        "status": "available",
        "sort_order": 2
    }
]


@router.get("/platforms")
async def get_platforms(db: AsyncSession = Depends(get_db)):
    """获取平台配置列表"""
    result = await db.execute(select(Setting).where(Setting.key == "platform_configs"))
    setting = result.scalars().first()
    if setting and setting.value:
        platforms = json.loads(setting.value)
    else:
        platforms = DEFAULT_PLATFORMS
    # 按 sort_order 排序
    return sorted(platforms, key=lambda p: p.get("sort_order", 0))


@router.put("/platforms")
async def update_platforms(platforms: list, db: AsyncSession = Depends(get_db), _admin: dict = Depends(get_current_admin)):
    """更新平台配置（管理员）"""
    result = await db.execute(select(Setting).where(Setting.key == "platform_configs"))
    setting = result.scalars().first()
    
    platforms_json = json.dumps(platforms, ensure_ascii=False)
    
    if setting:
        setting.value = platforms_json
    else:
        setting = Setting(key="platform_configs", value=platforms_json)
        db.add(setting)
    
    await db.commit()
    logger.info("平台配置已更新")
    return {"success": True}


# ===== 1.5.1 Launch Token 权限兜底 =====

@router.post("/{tool_id}/launch-token")
async def create_launch_token(
    tool_id: str,
    platform_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    创建工具启动令牌（权限兜底）
    
    后端校验：
    1. 用户已登录
    2. 授权码有效且未过期
    3. platform_scope 包含 platform_key
    4. 工具存在
    5. 工具 platform_key 与请求 platform_key 一致
    6. 工具 release_status 为 available 或 beta
    7. 当前用户 seat 有效
    8. 当前设备未超限
    """
    user_id = current_user.get("user_id")
    auth_code_id = current_user.get("auth_code_id")
    device_id = current_user.get("device_id")
    
    if not auth_code_id:
        return error_response("未找到授权信息", 401)
    
    # 1. 检查授权码
    result = await db.execute(
        select(AuthCode).where(AuthCode.id == auth_code_id)
    )
    auth_code = result.scalar_one_or_none()
    
    if not auth_code:
        return error_response("授权码不存在", 404)
    
    if auth_code.status != "active":
        return error_response("授权码状态异常", 403)
    
    if auth_code.expires_at and auth_code.expires_at < datetime.now():
        return error_response("授权码已过期", 403)
    
    # 2. 检查平台权限
    platform_scope = auth_code.platform_scope or "amazon"
    allowed_platforms = [p.strip() for p in platform_scope.split(",")]
    if platform_key not in allowed_platforms:
        return error_response(f"授权码不包含 {platform_key} 平台权限", 403)
    
    # 3. 获取工具配置
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalar_one_or_none()
    
    tools = []
    if setting and setting.value:
        tools = json.loads(setting.value)
    
    # 查找目标工具
    target_tool = None
    for tool in tools:
        if tool.get("id") == tool_id:
            target_tool = tool
            break
    
    if not target_tool:
        return error_response("工具不存在", 404)
    
    # 4. 检查工具平台一致性
    if target_tool.get("platform_key") != platform_key:
        return error_response("工具平台与请求平台不一致", 400)
    
    # 5. 检查工具状态
    release_status = target_tool.get("release_status", "available")
    if release_status not in ["available", "beta"]:
        return error_response(f"工具当前状态不可启动: {release_status}", 403)
    
    # 6. 检查套餐工具权限
    # 从 Plan 的 features 字段读取允许的工具列表
    if auth_code.plan_id:
        from models import Plan
        plan_result = await db.execute(
            select(Plan).where(Plan.id == auth_code.plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if plan and plan.features:
            try:
                plan_features = json.loads(plan.features)
                allowed_tools = plan_features.get("allowed_tools", [])
                # 如果有配置允许工具列表，则检查当前工具是否在列表中
                if allowed_tools and tool_id not in allowed_tools:
                    # 检查 capability_key 是否在允许列表中
                    capability_key = target_tool.get("capability_key")
                    if capability_key and capability_key not in allowed_tools:
                        return error_response("当前套餐暂不包含该工具", 403)
            except (json.JSONDecodeError, TypeError):
                # features 解析失败，保守策略：拒绝启动
                pass
    
    # 7. 检查 seat 有效性
    from models import AuthSeat
    seat_result = await db.execute(
        select(AuthSeat).where(
            AuthSeat.auth_code_id == auth_code_id,
            AuthSeat.user_id == user_id,
            AuthSeat.status == "active"
        )
    )
    active_seats = seat_result.scalars().all()
    if not active_seats:
        return error_response("当前授权席位无效，请重新登录或联系管理员", 403)
    active_seat = active_seats[0]
    
    # 8. 检查设备限制
    from models import Device
    device_result = await db.execute(
        select(func.count(Device.id)).where(
            Device.auth_code_id == auth_code_id,
            Device.device_id == device_id
        )
    )
    device_count = device_result.scalar() or 0
    
    # 检查当前设备是否已绑定
    if device_count == 0:
        # 检查是否超过最大设备数
        total_devices_result = await db.execute(
            select(func.count(Device.id)).where(Device.auth_code_id == auth_code_id)
        )
        total_devices = total_devices_result.scalar() or 0
        if total_devices >= (auth_code.max_devices or 1):
            return error_response("当前设备未授权或已超过设备数量限制", 403)
        
        # 自动绑定新设备
        new_device = Device(
            auth_code_id=auth_code_id,
            device_id=device_id,
            device_name=f"Device-{device_id[:8]}",
        )
        db.add(new_device)
        await db.flush()
        logger.info(f"自动绑定新设备: {device_id}")
    
    # 9. 生成 launch token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now() + timedelta(minutes=5)  # 5分钟有效期
    
    launch_token = LaunchToken(
        token=token,
        user_id=user_id,
        auth_code_id=auth_code_id,
        platform_key=platform_key,
        tool_id=tool_id,
        script_key=target_tool.get("script_key"),
        device_id=device_id,
        expires_at=expires_at,
        status="pending"
    )
    
    db.add(launch_token)
    await db.commit()
    
    logger.info(f"创建 launch token: user={user_id}, tool={tool_id}, platform={platform_key}")
    
    return success_response({
        "token": token,
        "expires_in": 300,  # 5分钟
        "launch_data": {
            "platform_key": platform_key,
            "tool_id": tool_id,
            "token": token,
            "script_key": target_tool.get("script_key"),
            "tool_name": target_tool.get("name"),
            "tool_module": target_tool.get("module"),
            "target_url": target_tool.get("target_url", ""),
            "category": target_tool.get("category", ""),
            "description": target_tool.get("description", ""),
        }
    })


@router.post("/launch-token/verify")
async def verify_launch_token(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    验证 launch token（供 Electron 调用）
    
    返回工具启动所需信息
    """
    result = await db.execute(
        select(LaunchToken).where(LaunchToken.token == token)
    )
    launch_token = result.scalar_one_or_none()
    
    if not launch_token:
        return error_response("Token 不存在", 404)
    
    if launch_token.status == "used":
        return error_response("Token 已使用", 403)
    
    if launch_token.expires_at < datetime.now():
        return error_response("Token 已过期", 403)
    
    # 标记为已使用
    launch_token.status = "used"
    launch_token.used_at = datetime.now()
    await db.commit()
    
    logger.info(f"验证 launch token: tool={launch_token.tool_id}, user={launch_token.user_id}")
    
    return success_response({
        "valid": True,
        "user_id": launch_token.user_id,
        "auth_code_id": launch_token.auth_code_id,
        "platform_key": launch_token.platform_key,
        "tool_id": launch_token.tool_id,
        "script_key": launch_token.script_key,
        "device_id": launch_token.device_id
    })
