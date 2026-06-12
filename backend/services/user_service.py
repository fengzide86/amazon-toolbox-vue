"""
用户服务模块
包含用户 CRUD、统计、分页查询等业务逻辑
"""
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, AuthCode, Device, Plan
from core.logging import get_logger
from core.response import success_response, error_response, ErrorCodes
from core.pagination import PaginationParams, paginate

logger = get_logger(__name__)


class UserService:
    """用户服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_users_list(
        self,
        keyword: Optional[str] = None,
        pagination: Optional[PaginationParams] = None
    ) -> Dict[str, Any]:
        """获取用户列表（支持搜索和分页）"""
        query = select(User).order_by(desc(User.created_at))
        
        # 关键词搜索
        if keyword:
            query = query.where(
                func.concat(
                    func.coalesce(User.name, ""),
                    func.coalesce(User.device_name, ""),
                    func.coalesce(User.phone, "")
                ).like(f"%{keyword}%")
            )
        
        if pagination:
            items, total = await paginate(query, self.db, pagination)
            return success_response(
                data=[self._serialize_user(u) for u in items],
                total=total,
                page=pagination.page,
                page_size=pagination.page_size,
            )
        else:
            result = await self.db.execute(query)
            users = result.scalars().all()
            return success_response(
                data=[self._serialize_user(u) for u in users]
            )
    
    async def get_user_by_id(self, user_id: int) -> Dict[str, Any]:
        """根据 ID 获取用户详情"""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        
        if not user:
            return error_response("用户不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        return success_response(data=self._serialize_user(user, detailed=True))
    
    async def update_user(self, user_id: int, data: dict) -> Dict[str, Any]:
        """更新用户信息"""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        
        if not user:
            return error_response("用户不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 更新字段
        updatable_fields = ["name", "phone", "total_seats", "extra_devices", "is_active"]
        for field in updatable_fields:
            if field in data:
                setattr(user, field, data[field])
        
        try:
            await self.db.commit()
            await self.db.refresh(user)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"更新用户失败: {e}")
            return error_response("更新用户失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"更新用户: {user.name or user.id} (ID: {user.id})")
        return success_response(data=self._serialize_user(user), message="更新成功")
    
    async def get_user_devices(self, user_id: int) -> Dict[str, Any]:
        """获取用户的设备列表"""
        # 先获取用户的授权码
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalars().first()
        
        if not user:
            return error_response("用户不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        if not user.auth_code_id:
            return success_response(data=[])
        
        # 查询设备
        devices_result = await self.db.execute(
            select(Device).where(Device.auth_code_id == user.auth_code_id)
        )
        devices = devices_result.scalars().all()
        
        return success_response(data=[
            {
                "id": d.id,
                "device_id": d.device_id,
                "device_name": d.device_name,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in devices
        ])
    
    async def get_user_stats(self) -> Dict[str, Any]:
        """获取用户统计"""
        # 总用户数
        total_result = await self.db.execute(select(func.count(User.id)))
        total_users = total_result.scalar() or 0
        
        # 活跃用户数（有活跃授权码）
        active_result = await self.db.execute(
            select(func.count(User.id)).where(
                User.auth_code_id.in_(
                    select(AuthCode.id).where(AuthCode.status == "active")
                )
            )
        )
        active_users = active_result.scalar() or 0
        
        # 今日新增
        today = datetime.now().date()
        today_result = await self.db.execute(
            select(func.count(User.id)).where(func.date(User.created_at) == today)
        )
        today_new = today_result.scalar() or 0
        
        return success_response(data={
            "total_users": total_users,
            "active_users": active_users,
            "today_new": today_new,
        })
    
    def _serialize_user(self, user: User, detailed: bool = False) -> dict:
        """序列化用户对象"""
        data = {
            "id": user.id,
            "name": user.name,
            "phone": user.phone,
            "device_id": user.device_id,
            "device_name": user.device_name,
            "total_seats": user.total_seats,
            "extra_devices": user.extra_devices,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
        
        if detailed:
            data["last_active_at"] = user.last_active_at.isoformat() if user.last_active_at else None
            data["updated_at"] = user.updated_at.isoformat() if user.updated_at else None
        
        return data