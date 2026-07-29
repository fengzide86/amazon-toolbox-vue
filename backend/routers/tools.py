"""
工具配置路由模块
包含工具配置的查询、更新等接口
支持工具分类和搜索功能
"""
import json
import secrets
from datetime import datetime, timedelta
from typing import cast

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import log_admin_action
from core.config import settings
from core.dependencies import get_current_admin, get_current_user
from core.deprecation import log_deprecated_api_call
from core.logging import get_logger
from core.response import CompatibleResponse, ErrorCodes, error_response, success_response
from database import get_db
from domains.access import resolve_product_access
from domains.catalog import (
    DEFAULT_CATEGORIES,
    force_demo_only_tool_configs,
    normalize_tool_config,
    normalize_tool_configs,
    resolve_tool_runtime,
)
from domains.catalog import (
    plan_code as _plan_code,
)
from models import AuthCode, AutomationBatch, LaunchToken, Setting
from services.tool_release_service import build_manifest, resolve_release_for_launch, sign_manifest

logger = get_logger(__name__)

router = APIRouter()


@router.get("/categories", response_model=CompatibleResponse)
async def get_tool_categories(db: AsyncSession = Depends(get_db)):
    """获取工具分类列表"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_categories"))
    setting = result.scalars().first()
    if setting and setting.value:
        return json.loads(setting.value)
    return DEFAULT_CATEGORIES


@router.get("", response_model=CompatibleResponse)
async def get_tools(
    category: str | None = Query(None, description="分类ID"),
    search: str | None = Query(None, description="搜索关键词"),
    platform_key: str | None = Query(None, description="平台: amazon / aliexpress"),
    db: AsyncSession = Depends(get_db)
):
    """获取工具配置列表，支持分类、搜索和平台筛选"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalars().first()
    
    tools = []
    if setting and setting.value:
        tools = json.loads(setting.value)

    tools = normalize_tool_configs(tools)
    if settings.TOOL_EXECUTION_MODE == "demo":
        tools = force_demo_only_tool_configs(tools)
    
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


@router.put("", response_model=CompatibleResponse)
async def update_tools(
    request: Request,
    tools: list[dict] = Body(...),
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_current_admin)
):
    """更新工具配置"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
    setting = result.scalars().first()
    
    before = json.loads(setting.value) if setting and setting.value else []
    normalized_tools = normalize_tool_configs(tools)
    if settings.TOOL_EXECUTION_MODE == "demo":
        normalized_tools = force_demo_only_tool_configs(normalized_tools)
    tools_json = json.dumps(normalized_tools, ensure_ascii=False)
    
    if setting:
        setting.value = tools_json
    else:
        setting = Setting(key="tool_configs", value=tools_json)
        db.add(setting)
    
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="demo_tool_config_update",
        target_type="tool_configs",
        target_id="all",
        detail={"role": actor.get("role"), "before": before, "after": normalized_tools, "reason": None},
        request=request,
    )
    await db.commit()
    logger.info("工具配置已更新")
    return {"success": True, "data": normalized_tools}


@router.put("/categories", response_model=CompatibleResponse)
async def update_tool_categories(
    categories: list,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_current_admin),
):
    """更新工具分类配置"""
    result = await db.execute(select(Setting).where(Setting.key == "tool_categories"))
    setting = result.scalars().first()
    
    before = json.loads(setting.value) if setting and setting.value else DEFAULT_CATEGORIES
    categories_json = json.dumps(categories, ensure_ascii=False)
    
    if setting:
        setting.value = categories_json
    else:
        setting = Setting(key="tool_categories", value=categories_json)
        db.add(setting)
    
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="demo_tool_categories_update",
        target_type="tool_categories",
        target_id="all",
        detail={"role": actor.get("role"), "before": before, "after": categories, "reason": None},
        request=request,
    )
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


@router.get("/platforms", response_model=CompatibleResponse)
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


@router.put("/platforms", response_model=CompatibleResponse)
async def update_platforms(
    platforms: list,
    request: Request,
    db: AsyncSession = Depends(get_db),
    actor: dict = Depends(get_current_admin),
):
    """更新平台配置（管理员）"""
    result = await db.execute(select(Setting).where(Setting.key == "platform_configs"))
    setting = result.scalars().first()
    
    before = json.loads(setting.value) if setting and setting.value else DEFAULT_PLATFORMS
    platforms_json = json.dumps(platforms, ensure_ascii=False)
    
    if setting:
        setting.value = platforms_json
    else:
        setting = Setting(key="platform_configs", value=platforms_json)
        db.add(setting)
    
    await log_admin_action(
        db,
        user_id=actor.get("staff_id"),
        user_name=actor.get("username"),
        action="platform_config_update",
        target_type="platform_configs",
        target_id="all",
        detail={"role": actor.get("role"), "before": before, "after": platforms, "reason": None},
        request=request,
    )
    await db.commit()
    logger.info("平台配置已更新")
    return {"success": True}


# ===== 工具启动授权（云端控制面） =====

@router.post("/{tool_id}/launch-grant", response_model=CompatibleResponse)
@router.post("/{tool_id}/launch-token", response_model=CompatibleResponse)
async def create_launch_token(
    request: Request,
    tool_id: str,
    platform_key: str,
    execution_mode: str = Query("single", pattern="^(single|batch)$"),
    client_batch_id: str | None = Query(None, max_length=100),
    client_item_id: str | None = Query(None, max_length=100),
    idempotency_key: str | None = Query(None, max_length=200),
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
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "FEATURE_DISABLED",
                "message": "当前为演示模式，真实工具尚未接入",
                "reason": "demo_only",
            },
        )
    if request.url.path.endswith("/launch-token"):
        log_deprecated_api_call(request, "/api/tools/{tool_id}/launch-token")
    user_id = current_user.get("user_id")
    auth_code_id = current_user.get("auth_code_id")
    device_id = current_user.get("device_id")
    
    if not auth_code_id:
        return error_response("未找到授权信息", ErrorCodes.UNAUTHORIZED)
    
    # 1. 检查授权码
    result = await db.execute(
        select(AuthCode).where(AuthCode.id == auth_code_id)
    )
    auth_code = result.scalar_one_or_none()
    
    if not auth_code:
        return error_response("授权码不存在", ErrorCodes.AUTH_CODE_INVALID)
    
    if auth_code.status != "active":
        return error_response("授权码状态异常", ErrorCodes.AUTH_CODE_FROZEN)
    
    if auth_code.expires_at and auth_code.expires_at < datetime.now():
        return error_response("授权码已过期", ErrorCodes.AUTH_CODE_EXPIRED)

    batch = None
    if execution_mode == "batch":
        access = await resolve_product_access(db, auth_code_id)
        if not (
            access.get("enabled")
            and access.get("product_type") == "business"
            and access["entitlements"].get("batch_execution")
            and access["entitlements"].get("multi_account_workspace")
        ):
            return error_response("当前授权不包含专业批量工作台", ErrorCodes.PERMISSION_DENIED)
        if not client_batch_id or not client_item_id or not idempotency_key:
            return error_response("批量启动上下文不完整", ErrorCodes.INVALID_PARAMS)
        batch_result = await db.execute(select(AutomationBatch).where(
            AutomationBatch.client_batch_id == client_batch_id,
            AutomationBatch.auth_code_id == auth_code_id,
            AutomationBatch.device_id == (device_id or ""),
        ))
        batch = batch_result.scalar_one_or_none()
        if not batch or batch.status != "running":
            return error_response("批次不存在或已经结束", ErrorCodes.RESOURCE_NOT_FOUND)
    
    # 2. 检查平台权限
    platform_scope = auth_code.platform_scope or "amazon"
    allowed_platforms = [p.strip() for p in platform_scope.split(",")]
    if platform_key not in allowed_platforms:
        return error_response(
            f"当前授权暂未包含 {platform_key} 平台",
            ErrorCodes.PLATFORM_NOT_INCLUDED,
            {"reason": "platform_not_included", "platform_key": platform_key},
        )
    
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
    target_tool = normalize_tool_config(target_tool)
    if target_tool.get("availability") not in {"live", "live_beta"}:
        return error_response(
            "该工具当前仅支持演示流程",
            ErrorCodes.TOOL_UNAVAILABLE,
            {"reason": "demo_only", "availability": target_tool.get("availability")},
        )
    
    # 4. 检查工具平台一致性
    if target_tool.get("platform_key") != platform_key:
        return error_response("工具平台与请求平台不一致", 400)
    
    # 5. 检查工具状态
    release_status = target_tool.get("release_status", "available")
    if release_status not in ["available", "beta"]:
        return error_response(
            "该工具暂时不可用，请稍后再试",
            ErrorCodes.TOOL_UNAVAILABLE,
            {"reason": "tool_unavailable", "release_status": release_status},
        )
    if execution_mode == "batch" and not target_tool.get("supports_batch"):
        return error_response("该工具未开放批量执行", ErrorCodes.PERMISSION_DENIED)
    if batch and batch.tool_id != tool_id:
        return error_response("批次工具与启动工具不一致", ErrorCodes.INVALID_PARAMS)
    
    # 6. 检查套餐工具权限。新旧数据兼容：
    # - 工具配置 available_plans 是主权限来源；
    # - Plan.features 中的 JSON allowed_tools 继续作为可选的精细覆盖。
    if auth_code.plan_id:
        from models import Plan
        plan_result = await db.execute(
            select(Plan).where(Plan.id == auth_code.plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if plan:
            plan_code = _plan_code(plan.name)
            available_plans = [str(item).upper() for item in target_tool.get("available_plans", [])]
            if available_plans and plan_code not in available_plans:
                return error_response(
                    "当前套餐暂未包含该工具",
                    ErrorCodes.PLAN_TOOL_NOT_INCLUDED,
                    {
                        "reason": "plan_not_included",
                        "tool_id": tool_id,
                        "plan_code": plan_code,
                        "available_plans": available_plans,
                    },
                )

        if plan and plan.features:
            try:
                plan_features = json.loads(plan.features)
                allowed_tools = plan_features.get("allowed_tools", []) if isinstance(plan_features, dict) else []
                # 如果有配置允许工具列表，则检查当前工具是否在列表中
                if allowed_tools and tool_id not in allowed_tools:
                    # 检查 capability_key 是否在允许列表中
                    capability_key = target_tool.get("capability_key")
                    if capability_key and capability_key not in allowed_tools:
                        return error_response(
                            "当前套餐暂未包含该工具",
                            ErrorCodes.PLAN_TOOL_NOT_INCLUDED,
                            {"reason": "plan_not_included", "tool_id": tool_id},
                        )
            except (json.JSONDecodeError, TypeError):
                # 旧套餐是中文权益文案，权限已由 available_plans 兜底。
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
            device_name=f"Device-{cast(str, device_id)[:8]}",
        )
        db.add(new_device)
        await db.flush()
        logger.info(f"自动绑定新设备: {device_id}")
    
    # 9. 生成一次性启动授权。launch-token 路径保留给旧客户端兼容。
    script_key, target_url = resolve_tool_runtime(target_tool, platform_key)
    release = await resolve_release_for_launch(db, tool_id, device_id or str(user_id))
    if release:
        manifest = release["manifest"]
        signature = release["signature"]
        signing_key_id = release.get("signing_key_id", settings.TOOL_SIGNING_KEY_ID)
        signature_required = True
        script_key = manifest["scriptKey"]
        tool_version = manifest["version"]
        runner_api_version = manifest["runnerApiVersion"]
    else:
        tool_version = target_tool.get("tool_version", "1.0.0")
        runner_api_version = int(target_tool.get("runner_api_version", 1))
        manifest = build_manifest({
            "tool_id": tool_id,
            "version": tool_version,
            "script_key": script_key,
            "runner_api_version": runner_api_version,
            "artifact_sha256": "embedded",
            "artifact_url": None,
        })
        signature_required = bool(settings.TOOL_SIGNING_PRIVATE_KEY_B64 and settings.TOOL_SIGNING_PUBLIC_KEY_B64)
        signature = sign_manifest(manifest) if signature_required else None
        signing_key_id = settings.TOOL_SIGNING_KEY_ID if signature_required else None
    existing_launch = None
    if execution_mode == "batch" and idempotency_key:
        existing_result = await db.execute(select(LaunchToken).where(LaunchToken.idempotency_key == idempotency_key))
        existing_launch = existing_result.scalar_one_or_none()
        if existing_launch and (
            existing_launch.auth_code_id != auth_code_id
            or existing_launch.tool_id != tool_id
            or existing_launch.client_batch_id != client_batch_id
            or existing_launch.client_item_id != client_item_id
        ):
            return error_response("启动幂等标识冲突", ErrorCodes.RESOURCE_ALREADY_EXISTS)

    if existing_launch and existing_launch.status == "used":
        return error_response("该批次项已经启动，不能重复执行", ErrorCodes.RESOURCE_ALREADY_EXISTS)
    if existing_launch and existing_launch.status == "pending" and existing_launch.expires_at > datetime.now():
        token = existing_launch.token
        expires_at = existing_launch.expires_at
    else:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(minutes=5)  # 5分钟有效期
        if existing_launch:
            existing_launch.token = token
            existing_launch.expires_at = expires_at
            existing_launch.status = "pending"
        else:
            launch_token = LaunchToken(
                token=token,
                user_id=user_id,
                auth_code_id=auth_code_id,
                platform_key=platform_key,
                tool_id=tool_id,
                script_key=script_key,
                device_id=device_id,
                expires_at=expires_at,
                status="pending",
                execution_mode=execution_mode,
                client_batch_id=client_batch_id,
                client_item_id=client_item_id,
                idempotency_key=idempotency_key,
            )
            db.add(launch_token)
        await db.commit()
    
    logger.info(f"创建 launch token: user={user_id}, tool={tool_id}, platform={platform_key}")
    
    return success_response({
        "token": token,
        "expires_in": 300,  # 5分钟
        "expires_at": expires_at.isoformat(),
        "launch_data": {
            "platform_key": platform_key,
            "tool_id": tool_id,
            "token": token,
            "script_key": script_key,
            "tool_name": target_tool.get("name"),
            "tool_module": target_tool.get("module"),
            "target_url": target_url,
            "category": target_tool.get("category", ""),
            "description": target_tool.get("description", ""),
            "expires_at": expires_at.isoformat(),
            "runner_api_version": runner_api_version,
            "tool_version": tool_version,
            "tool_manifest": manifest,
            "tool_signature": signature,
            "signing_key_id": signing_key_id,
            "signature_required": signature_required,
            "execution_mode": execution_mode,
            "client_batch_id": client_batch_id,
            "client_item_id": client_item_id,
        }
    })

@router.post("/launch-grant/verify", response_model=CompatibleResponse)
@router.post("/launch-token/verify", response_model=CompatibleResponse)
async def verify_launch_token(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """
    验证 launch token（供 Electron 调用）
    
    返回工具启动所需信息
    """
    if settings.TOOL_EXECUTION_MODE != "live":
        raise HTTPException(
            status_code=409,
            detail={"code": "FEATURE_DISABLED", "message": "当前为演示模式"},
        )
    if request.url.path.endswith("/launch-token/verify"):
        log_deprecated_api_call(request, "/api/tools/launch-token/verify")
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
        "device_id": launch_token.device_id,
        "execution_mode": launch_token.execution_mode,
        "client_batch_id": launch_token.client_batch_id,
        "client_item_id": launch_token.client_item_id,
    })
