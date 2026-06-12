"""
种子数据服务模块
负责初始化默认数据（管理员密码、套餐、工具配置等）
"""
from sqlalchemy import select
import json

from models import Setting, Plan
from database import async_session_maker
from core.config import settings
from core.security import hash_password
from core.logging import get_logger

logger = get_logger(__name__)


async def seed_initial_data():
    """初始化默认数据
    
    包括:
    - 默认管理员密码
    - 默认分润比例
    - 默认套餐
    - 默认工具配置
    """
    async with async_session_maker() as db:
        # 默认管理员密码（使用 bcrypt 哈希）
        result = await db.execute(select(Setting).where(Setting.key == "admin_password"))
        existing = result.scalars().first()
        if not existing:
            hashed_password = hash_password(settings.DEFAULT_ADMIN_PASSWORD)
            db.add(Setting(
                key="admin_password", 
                value=hashed_password, 
                description="管理员登录密码（bcrypt哈希）"
            ))
            logger.info("创建默认管理员密码")

        # 默认分润比例
        result = await db.execute(select(Setting).where(Setting.key == "profit_ratios"))
        existing = result.scalars().first()
        if not existing:
            db.add(Setting(
                key="profit_ratios",
                value=json.dumps(settings.DEFAULT_PROFIT_RATIOS),
                description="分润比例"
            ))
            logger.info("创建默认分润比例")

        # 默认套餐
        result = await db.execute(select(Plan).where(Plan.status != "deleted"))
        existing_plans = result.scalars().first()
        if not existing_plans:
            plans = [
                Plan(name="Y15 体验卡", price=15, duration_days=1, features="基础功能体验", status="active"),
                Plan(name="Y49 开局提速卡", price=49, duration_days=7, features="物流模板+新手工具", status="active"),
                Plan(name="Y199 5天冲刺包", price=199, duration_days=5, features="全部工具+广告脚本", status="active"),
                Plan(name="Y999 全程陪跑包", price=999, duration_days=90, features="全部功能+FBA/AGL脚本", status="active"),
            ]
            db.add_all(plans)
            logger.info("创建默认套餐")

        # 默认工具配置
        result = await db.execute(select(Setting).where(Setting.key == "tool_configs"))
        existing = result.scalars().first()
        if not existing:
            tools = [
                {"name": "新手快速注册工具", "module": "注册工具", "available_plans": ["Y49", "Y199", "Y999"], "status": "online"},
                {"name": "物流模板标准版", "module": "物流模块", "available_plans": ["Y49", "Y199", "Y999"], "status": "online"},
                {"name": "物流模板成本优选版", "module": "物流模块", "available_plans": ["Y199", "Y999"], "status": "online"},
                {"name": "自动上广告脚本", "module": "广告脚本", "available_plans": ["Y199", "Y999"], "status": "online"},
                {"name": "自动发货脚本", "module": "发货脚本", "available_plans": ["Y199", "Y999"], "status": "online"},
                {"name": "自动上品脚本", "module": "上品脚本", "available_plans": ["Y199", "Y999"], "status": "online"},
                {"name": "自动发FBA/AGL脚本", "module": "发货脚本", "available_plans": ["Y999"], "status": "online"},
            ]
            db.add(Setting(
                key="tool_configs", 
                value=json.dumps(tools, ensure_ascii=False), 
                description="工具配置列表"
            ))
            logger.info("创建默认工具配置")

        await db.commit()
        logger.info("种子数据初始化完成")