"""
认证服务模块
包含授权码验证、管理员登录、Token 管理等业务逻辑
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import AuthCode, User, Device, Plan, Setting, AuthSeat
from schemas import VerifyRequest, VerifyResponse
from core.security import (
    verify_password_fallback, hash_password,
    create_access_token, verify_token, extract_token_from_header
)
from core.config import settings
from core.logging import get_logger
from core.response import success_response, error_response, ErrorCodes
from core.cache import cache, CacheKeys

logger = get_logger(__name__)


class AuthService:
    """认证服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def verify_auth_code(
        self,
        code: str,
        device_id: str,
        device_name: str,
        platform_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """授权码验证（用户登录）
        
        流程:
        1. 验证授权码是否存在
        2. 检查授权码状态（冻结、过期、删除）
        3. 检查平台权限（1.5 新增）
        4. 首次激活时创建用户记录
        5. 席位检查（1.5 新增）
        6. 多设备支持：检查设备绑定情况
        7. 返回 JWT Token
        """
        code = code.strip()
        
        # 1. 查询授权码
        result = await self.db.execute(
            select(AuthCode).where(AuthCode.code == code)
        )
        code_obj = result.scalars().first()
        
        if not code_obj:
            return error_response("授权码无效", ErrorCodes.AUTH_CODE_INVALID)
        
        # 2. 检查状态
        if code_obj.status == "frozen":
            return error_response("授权码已被冻结，请联系客服", ErrorCodes.AUTH_CODE_FROZEN)
        
        if code_obj.status == "deleted":
            return error_response("授权码已被删除，请联系客服", ErrorCodes.AUTH_CODE_INVALID)
        
        if code_obj.status == "expired" or (code_obj.expires_at and code_obj.expires_at < datetime.now()):
            return error_response("授权码已过期", ErrorCodes.AUTH_CODE_EXPIRED)
        
        # 3. 检查平台权限（1.5 新增）
        if platform_key:
            platform_scope = code_obj.platform_scope or "amazon"  # 默认亚马逊
            allowed_platforms = [p.strip() for p in platform_scope.split(",")]
            if platform_key not in allowed_platforms:
                platform_name = "亚马逊" if platform_key == "amazon" else "速卖通"
                return error_response(
                    f"当前授权码不包含{platform_name}平台权限，如需使用请升级授权",
                    ErrorCodes.AUTH_CODE_INVALID
                )
        
        # 4. 首次激活
        if code_obj.status == "unused":
            code_obj.status = "active"
            code_obj.device_id = device_id
            code_obj.device_name = device_name
            
            # 获取套餐天数
            days = 30
            if code_obj.plan_id:
                plan_result = await self.db.execute(
                    select(Plan).where(Plan.id == code_obj.plan_id)
                )
                plan = plan_result.scalars().first()
                if plan:
                    days = plan.duration_days
            
            code_obj.expires_at = datetime.now() + timedelta(days=days)
            
            # 创建用户记录
            user = User(
                auth_code_id=code_obj.id,
                device_id=device_id,
                device_name=device_name,
                total_seats=code_obj.seat_limit or 1,
            )
            self.db.add(user)
            await self.db.flush()
            code_obj.user_id = user.id
            logger.info(f"授权码 {code} 首次激活，用户ID: {user.id}")
        
        # 5. 席位检查（1.5 新增）
        seat_limit = code_obj.seat_limit or 1
        
        # 检查当前设备是否已有席位
        existing_seat = await self.db.execute(
            select(AuthSeat).where(
                AuthSeat.auth_code_id == code_obj.id,
                AuthSeat.device_id == device_id,
                AuthSeat.status == "active"
            )
        )
        seat_obj = existing_seat.scalars().first()
        
        if not seat_obj:
            # 检查席位数是否已满
            active_seats_count = await self.db.execute(
                select(func.count(AuthSeat.id)).where(
                    AuthSeat.auth_code_id == code_obj.id,
                    AuthSeat.status == "active"
                )
            )
            active_seats = active_seats_count.scalar() or 0
            
            if active_seats >= seat_limit:
                return error_response(
                    f"该授权码席位数已满({seat_limit}席)，请联系管理员升级",
                    ErrorCodes.DEVICE_LIMIT_EXCEEDED
                )
            
            # 创建新席位
            seat_obj = AuthSeat(
                auth_code_id=code_obj.id,
                user_id=code_obj.user_id,
                device_id=device_id,
                device_name=device_name,
                seat_no=active_seats + 1,
                status="active"
            )
            self.db.add(seat_obj)
            await self.db.flush()
            
            # P2: 并发安全 - 创建后二次检查席位数
            recheck_count = await self.db.execute(
                select(func.count(AuthSeat.id)).where(
                    AuthSeat.auth_code_id == code_obj.id,
                    AuthSeat.status == "active"
                )
            )
            recheck_seats = recheck_count.scalar() or 0
            if recheck_seats > seat_limit:
                # 超限，回滚当前席位
                seat_obj.status = "inactive"
                await self.db.flush()
                return error_response(
                    f"该授权码席位数已满({seat_limit}席)，请联系管理员升级",
                    ErrorCodes.DEVICE_LIMIT_EXCEEDED
                )
            
            logger.info(f"授权码 {code} 创建新席位 #{active_seats + 1}")
        
        # 6. 多设备支持
        existing_device = await self.db.execute(
            select(Device).where(
                Device.auth_code_id == code_obj.id,
                Device.device_id == device_id
            )
        )
        device_obj = existing_device.scalars().first()
        
        if not device_obj:
            # 检查设备上限
            device_count_result = await self.db.execute(
                select(func.count(Device.id)).where(Device.auth_code_id == code_obj.id)
            )
            device_count = device_count_result.scalar() or 0
            
            if device_count >= (code_obj.max_devices or 1):
                return error_response(
                    f"该授权码已达设备上限({code_obj.max_devices}台)，请联系管理员",
                    ErrorCodes.DEVICE_LIMIT_EXCEEDED
                )
            
            # 绑定新设备
            device_obj = Device(
                auth_code_id=code_obj.id,
                device_id=device_id,
                device_name=device_name
            )
            self.db.add(device_obj)
            await self.db.flush()
            logger.info(f"授权码 {code} 绑定新设备: {device_name}")
        
        # 7. 提交事务
        try:
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            logger.error(f"验证过程出错: {e}")
            return error_response("验证过程出错，请重试", ErrorCodes.DATABASE_ERROR)
        
        # 8. 获取套餐名称
        plan_name = "未知"
        if code_obj.plan_id:
            plan_result = await self.db.execute(
                select(Plan.name).where(Plan.id == code_obj.plan_id)
            )
            plan_name = plan_result.scalar() or "未知"
        
        # 9. 获取席位和设备统计
        active_seats_count = await self.db.execute(
            select(func.count(AuthSeat.id)).where(
                AuthSeat.auth_code_id == code_obj.id,
                AuthSeat.status == "active"
            )
        )
        active_seats = active_seats_count.scalar() or 0
        
        device_count_result = await self.db.execute(
            select(func.count(Device.id)).where(Device.auth_code_id == code_obj.id)
        )
        device_count = device_count_result.scalar() or 0
        
        # 10. 生成 JWT Token
        token = create_access_token(data={
            "user_id": code_obj.user_id,
            "role": "user",
            "auth_code_id": code_obj.id,
        })
        
        # 解析平台权限
        platform_scope = code_obj.platform_scope or "amazon"
        platform_list = [p.strip() for p in platform_scope.split(",")]
        
        return success_response(
            data={
                "token": token,
                "user_id": code_obj.user_id,
                "code": code_obj.code,
                "plan_name": plan_name,
                "expires_at": code_obj.expires_at.isoformat() if code_obj.expires_at else None,
                "device_id": code_obj.device_id,
                # 1.5 新增字段
                "platform_scope": platform_list,
                "scene_type": code_obj.scene_type,
                "seat_limit": seat_limit,
                "seat_used": active_seats,
                "max_devices": code_obj.max_devices or 1,
                "device_used": device_count,
            },
            message="验证成功"
        )
    
    async def admin_login(self, password: str) -> Dict[str, Any]:
        """管理员登录
        
        支持旧版明文密码的自动升级
        """
        result = await self.db.execute(
            select(Setting).where(Setting.key == "admin_password")
        )
        setting = result.scalars().first()
        
        if setting and setting.value:
            is_valid, needs_upgrade = verify_password_fallback(password, setting.value)
            
            if is_valid:
                if needs_upgrade:
                    setting.value = hash_password(password)
                    await self.db.commit()
                    logger.info("管理员密码已自动升级为 bcrypt 格式")
                
                token = create_access_token(data={
                    "user_id": 0,
                    "role": "admin",
                    "auth_code_id": None,
                })
                
                logger.info("管理员登录成功")
                return success_response(
                    data={"token": token, "role": "admin"},
                    message="登录成功"
                )
        
        logger.warning("管理员登录失败: 密码错误")
        return error_response("密码错误", ErrorCodes.UNAUTHORIZED)
    
    async def check_auth_status(self, auth_code_id: Optional[int]) -> Dict[str, Any]:
        """检查授权码状态（用于踢人检测）"""
        if not auth_code_id:
            return success_response(data={"role": "admin"}, message="管理员")
        
        result = await self.db.execute(
            select(AuthCode).where(AuthCode.id == auth_code_id)
        )
        code_obj = result.scalars().first()
        
        if not code_obj:
            return error_response("授权码无效，请重新登录", ErrorCodes.AUTH_CODE_INVALID)
        
        if code_obj.status == "frozen":
            return error_response("您的授权码已被冻结，请联系客服", ErrorCodes.AUTH_CODE_FROZEN)
        
        if code_obj.status == "expired" or (code_obj.expires_at and code_obj.expires_at < datetime.now()):
            return error_response("您的授权码已过期，请续费", ErrorCodes.AUTH_CODE_EXPIRED)
        
        if code_obj.status == "deleted":
            return error_response("您的授权码已被删除，请联系客服", ErrorCodes.AUTH_CODE_INVALID)
        
        # 获取套餐名称
        plan_name = "未知"
        if code_obj.plan_id:
            plan_result = await self.db.execute(
                select(Plan.name).where(Plan.id == code_obj.plan_id)
            )
            plan_name = plan_result.scalar() or "未知"
        
        return success_response(
            data={
                "role": "user",
                "plan_name": plan_name,
                "expires_at": code_obj.expires_at.isoformat() if code_obj.expires_at else None,
            },
            message="正常"
        )
    
    async def get_user_info(self, user_id: int, auth_code_id: Optional[int], role: str) -> Dict[str, Any]:
        """获取当前用户信息"""
        if role == "admin":
            return success_response(data={
                "user_id": 0,
                "role": "admin",
                "name": "管理员",
            })
        
        # 查询用户信息
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        
        if not user:
            return error_response("用户不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 查询授权码信息
        plan_name = "未知"
        expires_at = None
        if auth_code_id:
            auth_code_result = await self.db.execute(
                select(AuthCode).where(AuthCode.id == auth_code_id)
            )
            auth_code = auth_code_result.scalars().first()
            
            if auth_code and auth_code.plan_id:
                plan_result = await self.db.execute(
                    select(Plan.name).where(Plan.id == auth_code.plan_id)
                )
                plan_name = plan_result.scalar() or "未知"
                expires_at = auth_code.expires_at.isoformat() if auth_code.expires_at else None
        
        return success_response(data={
            "user_id": user.id,
            "role": "user",
            "name": user.name or user.device_name or "用户",
            "device_id": user.device_id,
            "device_name": user.device_name,
            "plan_name": plan_name,
            "expires_at": expires_at,
        })
    
    async def refresh_token(self, user_id: int, role: str, auth_code_id: Optional[int]) -> Dict[str, Any]:
        """刷新 Token"""
        new_token = create_access_token(data={
            "user_id": user_id,
            "role": role,
            "auth_code_id": auth_code_id,
        })
        
        return success_response(data={"token": new_token})