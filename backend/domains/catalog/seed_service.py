"""
种子数据服务模块
负责初始化默认数据（管理员密码、套餐、工具配置等）
"""
import json
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.logging import get_logger
from database import async_session_maker
from domains.catalog.tool_config import normalize_tool_configs
from models import KnowledgeBase, Order, Plan, ProfitRecord, Setting, StaffUser
from services.staff_service import migrate_legacy_admin_password

logger = get_logger(__name__)

CENT = Decimal("0.01")
INTERNAL_ORDER_PREFIX = "INT-SEED-"

DEFAULT_REGISTER_TOOL = {
    "id": "tool_reg_newbie",
    "name": "新手快速注册工具",
    "module": "注册工具",
    "category": "operation",
    "platform_key": "amazon",
    "capability_key": "register",
    "release_status": "available",
    "status": "online",
    "availability": "demo_only",
    "demo_scenario_id": "register_walkthrough_v1",
    "supports_demo_single": True,
    "supports_demo_batch": False,
    "supports_live_single": False,
    "supports_live_batch": False,
    "requires_signature": False,
    "script_key": "demo.register_walkthrough_v1",
    "target_url": "",
    "tool_version": "1.0.0",
    "runner_api_version": 1,
    "description": "演示店铺注册准备、资料核对和结果页的模拟流程。",
    "available_plans": ["Y15", "Y49", "Y199", "Y999"],
    "sort_order": 1,
    "capability_tags": ["资料处理", "页面核验", "结果确认"],
    "preparation_notes": ["准备可正常登录的卖家账号", "按页面提示准备真实资料"],
    "intervention_scenarios": ["登录", "验证码", "二次验证"],
    "supports_batch": False,
    "business_description": "",
    "batch_input_schema": [],
}


def default_tool_configs() -> list[dict[str, Any]]:
    tools = [
        dict(DEFAULT_REGISTER_TOOL),
        {
            "id": "tool_logistics_standard",
            "name": "物流模板标准版",
            "module": "物流模块",
            "category": "operation",
            "platform_key": "amazon",
            "capability_key": "logistics_standard",
            "release_status": "available",
            "status": "online",
            "description": "标准版物流模板，支持主流物流商",
            "available_plans": ["Y49", "Y199", "Y999"],
            "sort_order": 2
        },
        {
            "id": "tool_logistics_cost",
            "name": "物流模板成本优选版",
            "module": "物流模块",
            "category": "operation",
            "platform_key": "amazon",
            "capability_key": "logistics_cost",
            "release_status": "available",
            "status": "online",
            "description": "智能成本优选，自动匹配最优物流方案",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 3
        },
        {
            "id": "tool_ad_script",
            "name": "自动上广告脚本",
            "module": "广告脚本",
            "category": "automation",
            "platform_key": "amazon",
            "capability_key": "ad_script",
            "release_status": "available",
            "status": "online",
            "description": "自动化创建和管理亚马逊广告活动",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 4
        },
        {
            "id": "tool_ship_script",
            "name": "自动发货脚本",
            "module": "发货脚本",
            "category": "automation",
            "platform_key": "amazon",
            "capability_key": "ship_script",
            "release_status": "available",
            "status": "online",
            "description": "批量自动处理订单发货和物流跟踪",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 5
        },
        {
            "id": "tool_listing_script",
            "name": "自动上品脚本",
            "module": "上品脚本",
            "category": "automation",
            "platform_key": "amazon",
            "capability_key": "listing_script",
            "release_status": "available",
            "status": "online",
            "description": "批量上传产品Listing，支持模板导入",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 6
        },
        {
            "id": "tool_fba_agl",
            "name": "自动发FBA/AGL脚本",
            "module": "发货脚本",
            "category": "automation",
            "platform_key": "amazon",
            "capability_key": "fba_agl",
            "release_status": "available",
            "status": "online",
            "description": "FBA/AGL发货自动化，支持多仓库分配",
            "available_plans": ["Y999"],
            "sort_order": 7
        },
        {
            "id": "tool_ali_reg",
            "name": "速卖通快速开店工具",
            "module": "注册工具",
            "category": "operation",
            "platform_key": "aliexpress",
            "capability_key": "ali_register",
            "release_status": "available",
            "status": "online",
            "description": "速卖通店铺快速注册和资质提交",
            "available_plans": ["Y49", "Y199", "Y999"],
            "sort_order": 8
        },
        {
            "id": "tool_ali_listing",
            "name": "速卖通上品助手",
            "module": "上品脚本",
            "category": "automation",
            "platform_key": "aliexpress",
            "capability_key": "ali_listing",
            "release_status": "available",
            "status": "online",
            "description": "批量上传速卖通产品，支持多语言优化",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 9
        },
        {
            "id": "tool_ali_ship",
            "name": "速卖通自动发货",
            "module": "发货脚本",
            "category": "automation",
            "platform_key": "aliexpress",
            "capability_key": "ali_ship",
            "release_status": "available",
            "status": "online",
            "description": "速卖通订单自动发货和物流同步",
            "available_plans": ["Y199", "Y999"],
            "sort_order": 10
        },
    ]
    batch_capabilities = {"ad_script", "ship_script", "listing_script", "fba_agl", "ali_listing", "ali_ship"}
    for tool in tools:
        capability_key = str(tool.get("capability_key") or tool.get("id") or "demo")
        supports_batch = capability_key in batch_capabilities
        tool.update({
            "availability": "demo_only",
            "demo_scenario_id": f"{capability_key}_walkthrough_v1",
            "supports_demo_single": True,
            "supports_demo_batch": supports_batch,
            "supports_live_single": False,
            "supports_live_batch": False,
            "supports_batch": supports_batch,
            "script_key": f"demo.{capability_key}_walkthrough_v1",
            "target_url": "",
            "requires_signature": False,
        })
    return normalize_tool_configs(tools)


def default_tool_configs_by_name() -> dict[str, dict[str, Any]]:
    mapping = {tool["name"]: tool for tool in default_tool_configs()}
    mapping["亚马逊注册页面巡检"] = DEFAULT_REGISTER_TOOL
    return mapping


def ensure_tool_runtime_fields(tools: list[dict[str, Any]]) -> bool:
    """把旧工具配置收口到明确 Demo Adapter，返回是否发生修改。"""
    changed = False
    for tool in tools:
        capability_key = tool.get("capability_key") or tool.get("id") or "unknown"
        scenario_id = tool.get("demo_scenario_id") or f"{capability_key}_walkthrough_v1"
        defaults = {
            "availability": "demo_only",
            "demo_scenario_id": scenario_id,
            "supports_demo_single": True,
            "supports_demo_batch": bool(tool.get("supports_demo_batch", tool.get("supports_batch", False))),
            "supports_live_single": False,
            "supports_live_batch": False,
            "script_key": f"demo.{scenario_id}",
            "target_url": "",
            "requires_signature": False,
            "tool_version": "1.0.0",
            "runner_api_version": 1,
        }
        for key, value in defaults.items():
            if tool.get(key) != value:
                tool[key] = value
                changed = True
    return changed


def _profit_shares(amount: Decimal) -> dict[str, Decimal]:
    ratios = {key: Decimal(value) for key, value in settings.DEFAULT_PROFIT_RATIOS.items()}
    shares: dict[str, Decimal] = {}
    allocated = Decimal("0")
    keys = list(ratios)
    for key in keys[:-1]:
        shares[key] = (amount * ratios[key]).quantize(CENT, rounding=ROUND_HALF_UP)
        allocated += shares[key]
    shares[keys[-1]] = amount - allocated
    return shares


async def _seed_internal_validation_data(db: AsyncSession) -> None:
    """Create deterministic, non-credential internal acceptance fixtures."""
    archived = (
        await db.execute(select(Plan).where(Plan.name == "内部归档样例（不可售）"))
    ).scalar_one_or_none()
    if not archived:
        db.add(Plan(
            name="内部归档样例（不可售）",
            price=Decimal("1.00"),
            duration_days=1,
            features="仅用于验证 archived 终态",
            status="archived",
            product_type="consumer",
            entitlements="{}",
        ))
        await db.flush()

    plan = (
        await db.execute(
            select(Plan)
            .where(Plan.status == "active")
            .order_by(Plan.price.desc(), Plan.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if plan:
        now = datetime.utcnow()
        fixtures: dict[str, dict[str, Any]] = {
            "PENDING": {"status": "pending"},
            "PAID": {"status": "paid", "paid_at": now},
            "REFUNDED": {
                "status": "refunded",
                "paid_at": now,
                "refunded_at": now,
                "refund_reason": "内部验收全额退款样例",
                "refund_amount": plan.price,
            },
            "CANCELLED": {
                "status": "cancelled",
                "cancelled_at": now,
                "cancel_reason": "内部验收取消样例",
            },
        }
        for suffix, values in fixtures.items():
            order_no = f"{INTERNAL_ORDER_PREFIX}{suffix}"
            order = (
                await db.execute(select(Order).where(Order.order_no == order_no))
            ).scalar_one_or_none()
            if not order:
                order = Order(
                    order_no=order_no,
                    plan_id=plan.id,
                    plan_name_snapshot=plan.name,
                    plan_price_snapshot=plan.price,
                    plan_duration_days_snapshot=plan.duration_days,
                    amount=plan.price,
                    channel="internal_seed",
                    responsible="system",
                    platform_key="amazon",
                    **values,
                )
                db.add(order)
                await db.flush()
            if values["status"] not in {"paid", "refunded"}:
                continue
            existing_profit = (
                await db.execute(select(ProfitRecord).where(ProfitRecord.order_id == order.id))
            ).scalar_one_or_none()
            if existing_profit:
                continue
            amount = Decimal(str(order.amount)).quantize(CENT, rounding=ROUND_HALF_UP)
            shares = _profit_shares(amount)
            db.add(ProfitRecord(
                order_id=order.id,
                status="active" if values["status"] == "paid" else "reversed",
                policy_version=1,
                ratios_snapshot=json.dumps(settings.DEFAULT_PROFIT_RATIOS, ensure_ascii=False),
                order_amount_snapshot=amount,
                tech_share=shares["tech"],
                market_share=shares["market"],
                product_share=shares["product"],
                service_share=shares["service"],
                coordination_share=shares["coordination"],
                record_share=shares["record"],
                reversed_at=now if values["status"] == "refunded" else None,
                reversal_reason="内部验收全额退款样例" if values["status"] == "refunded" else None,
            ))

    faq_fixtures = [
        (
            "演示模式说明",
            "当前所有工具均为演示模式。演示完成只表示模拟流程播放完毕，不代表真实平台执行成功。",
            ["演示模式", "真实执行", "执行成功"],
        ),
        (
            "批量演示与数据隐私",
            "批量演示只使用内置虚拟样例。Excel 原文、账号、密码和 Cookie 不会上传到服务器。",
            ["Excel", "批量演示", "账号数据", "Cookie"],
        ),
        (
            "如何转人工客服",
            "在客服会话中选择转人工，系统会保留当前问题并创建工单。",
            ["人工", "转人工", "工单"],
        ),
    ]
    for title, content, keywords in faq_fixtures:
        existing = (
            await db.execute(select(KnowledgeBase).where(KnowledgeBase.title == title))
        ).scalar_one_or_none()
        if not existing:
            db.add(KnowledgeBase(
                category="使用教程",
                title=title,
                content=content,
                keywords=json.dumps(keywords, ensure_ascii=False),
                priority="high",
                status="active",
                platform_key=None,
                capability_key=None,
                vector_id=None,
            ))


def upgrade_default_tool_configs(tools: list[dict[str, Any]]) -> bool:
    """补齐旧默认工具配置；避免覆盖管理员自定义工具。"""
    changed = False
    defaults_by_name = default_tool_configs_by_name()
    legacy_names = {"新手快速注册工具", "亚马逊注册页面巡检"}
    legacy_descriptions = {
        "一键完成亚马逊新手店铺注册流程",
        "面向新手卖家的注册流程工具，按步骤完成店铺注册准备、资料处理、信息核对和结果确认。",
        "打开亚马逊卖家中心注册入口，识别页面结构、表单、按钮和链接，并生成巡检截图；不填写、不点击提交、不发送任何真实数据。",
        DEFAULT_REGISTER_TOOL["description"],
    }
    for tool in tools:
        raw_name = tool.get("name")
        default_tool = defaults_by_name.get(str(raw_name)) if raw_name else None
        if default_tool and (
            not tool.get("id")
            or tool.get("id") == "tool_tool"
            or not tool.get("platform_key")
            or not tool.get("capability_key")
            or not tool.get("script_key")
            or tool.get("script_key") == "amazon.unknown.v1"
        ):
            for key, value in default_tool.items():
                if tool.get(key) != value:
                    tool[key] = value
                    changed = True
            continue

        if tool.get("id") != DEFAULT_REGISTER_TOOL["id"]:
            continue
        can_upgrade = (
            tool.get("name") in legacy_names
            or tool.get("script_key") in {None, "", "amazon.register.v1"}
            or tool.get("description") in legacy_descriptions
        )
        if not can_upgrade:
            continue
        for key, value in DEFAULT_REGISTER_TOOL.items():
            if tool.get(key) != value:
                tool[key] = value
                changed = True
    return changed


async def seed_initial_data() -> None:
    """初始化默认数据
    
    包括:
    - 迁移旧管理员 bcrypt 哈希（绝不生成默认密码）
    - 默认分润比例
    - 默认套餐
    - 默认工具配置
    """
    async with async_session_maker() as db:
        await migrate_legacy_admin_password(db)
        staff_result = await db.execute(select(StaffUser.id).limit(1))
        if staff_result.scalar_one_or_none() is None:
            logger.warning(
                "尚未配置后台账号；请在 backend 目录运行 "
                "python -m scripts.bootstrap_staff"
            )

        result = await db.execute(select(Setting).where(Setting.key == "business_workspace_enabled"))
        business_setting = result.scalars().first()
        if not business_setting:
            db.add(Setting(
                key="business_workspace_enabled",
                value="true",
                description="B 端演示工作台总开关",
            ))
        elif settings.APP_ENV in {"internal", "test"} and business_setting.value != "true":
            business_setting.value = "true"
            business_setting.description = "B 端演示工作台总开关"

        # 默认分润比例
        result = await db.execute(select(Setting).where(Setting.key == "profit_ratios"))
        existing = result.scalars().first()
        if not existing:
            db.add(Setting(
                key="profit_ratios",
                value=json.dumps({"version": 1, "ratios": settings.DEFAULT_PROFIT_RATIOS}),
                description="分润比例"
            ))
            logger.info("创建默认分润比例")
        else:
            try:
                policy = json.loads(existing.value or "{}")
                if "ratios" not in policy:
                    existing.value = json.dumps({"version": 1, "ratios": policy})
                    logger.info("旧版分润比例已升级为带版本的策略快照")
            except (json.JSONDecodeError, TypeError):
                logger.warning("分润策略格式无效；收款状态迁移将拒绝执行，直至超级管理员修复")

        # 默认套餐
        result = await db.execute(select(Plan).where(Plan.status.notin_(["archived", "deleted"])))
        existing_plans = result.scalars().all()
        if not existing_plans:
            plans = [
                Plan(name="Y15 体验卡", price=15, duration_days=1, features="基础功能体验", status="disabled"),
                Plan(name="Y49 开局提速卡", price=49, duration_days=7, features="物流模板+新手工具", status="active"),
                Plan(name="Y199 5天冲刺包", price=199, duration_days=5, features="全部工具+广告脚本", status="active"),
                Plan(
                    name="Y999 全程陪跑包",
                    price=999,
                    duration_days=90,
                    features="全部功能+FBA/AGL脚本",
                    status="active",
                    product_type="business",
                    entitlements=json.dumps({
                        "batch_execution": True,
                        "multi_account_workspace": True,
                        "desktop_notification": True,
                        "usage_metering": False,
                        "max_batch_rows": 50,
                        "max_open_sessions": 6,
                    }, ensure_ascii=False),
                ),
            ]
            db.add_all(plans)
            logger.info("创建默认套餐")
        else:
            business_plan = next((plan for plan in existing_plans if plan.name == "Y999 全程陪跑包"), None)
            if business_plan:
                business_plan.product_type = "business"
                business_plan.entitlements = json.dumps({
                    "batch_execution": True,
                    "multi_account_workspace": True,
                    "desktop_notification": True,
                    "usage_metering": False,
                    "max_batch_rows": 50,
                    "max_open_sessions": 6,
                }, ensure_ascii=False)

        # 默认工具配置
        result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
        existing = result.scalars().first()
        if not existing:
            tools = default_tool_configs()
            ensure_tool_runtime_fields(tools)
            db.add(Setting(
                key="tool_configs", 
                value=json.dumps(tools, ensure_ascii=False), 
                description="工具配置列表"
            ))
            logger.info("创建默认工具配置")
        else:
            try:
                tools = json.loads(existing.value or "[]")
                changed = False
                if not tools:
                    tools = default_tool_configs()
                    changed = True
                    logger.info("现有工具配置为空，已恢复默认工具配置")
                changed = upgrade_default_tool_configs(tools) or changed
                changed = ensure_tool_runtime_fields(tools) or changed
                if changed:
                    existing.value = json.dumps(tools, ensure_ascii=False)
                    logger.info("现有工具已收口为内测演示配置")
            except (json.JSONDecodeError, TypeError):
                logger.warning("现有工具配置格式无效，跳过演示字段补齐")

        if settings.APP_ENV in {"internal", "test"}:
            await db.flush()
            await _seed_internal_validation_data(db)

        await db.commit()
        logger.info("种子数据初始化完成")
