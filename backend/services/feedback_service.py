"""
工单反馈服务模块
包含工单 CRUD、状态管理、分页查询等业务逻辑
"""
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models import Feedback, User
from core.logging import get_logger
from core.response import success_response, error_response, ErrorCodes
from core.pagination import PaginationParams, paginate

logger = get_logger(__name__)


class FeedbackService:
    """工单反馈服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_feedback_list(
        self,
        status: Optional[str] = None,
        user_id: Optional[int] = None,
        platform_key: Optional[str] = None,
        pagination: Optional[PaginationParams] = None
    ) -> Dict[str, Any]:
        """获取工单列表（支持过滤和分页）"""
        query = select(Feedback).order_by(desc(Feedback.created_at))
        
        # 状态过滤
        if status:
            query = query.where(Feedback.status == status)
        
        # 用户过滤
        if user_id:
            query = query.where(Feedback.user_id == user_id)
        
        # 平台过滤（1.5 新增）
        if platform_key:
            query = query.where(Feedback.platform_key == platform_key)
        
        if pagination:
            items, total = await paginate(query, self.db, pagination)
            return success_response(
                data=[self._serialize_feedback(f) for f in items],
                total=total,
                page=pagination.page,
                page_size=pagination.page_size,
            )
        else:
            result = await self.db.execute(query)
            feedbacks = result.scalars().all()
            return success_response(
                data=[self._serialize_feedback(f) for f in feedbacks]
            )
    
    async def get_feedback_by_id(self, feedback_id: int) -> Dict[str, Any]:
        """根据 ID 获取工单详情"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalars().first()
        
        if not feedback:
            return error_response("工单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        return success_response(data=self._serialize_feedback(feedback, detailed=True))
    
    async def create_feedback(self, data: dict) -> Dict[str, Any]:
        """创建工单"""
        feedback = Feedback(
            user_id=data.get("user_id"),
            title=data.get("title", ""),
            content=data.get("content", ""),
            screenshot=data.get("screenshot"),
            screenshots=data.get("screenshots"),
            status="pending",
            priority=data.get("priority", "normal"),
            platform_key=data.get("platform_key"),
            capability_key=data.get("capability_key"),
            tool_id=data.get("tool_id"),
            run_log_id=data.get("run_log_id"),
        )
        self.db.add(feedback)
        
        try:
            await self.db.commit()
            await self.db.refresh(feedback)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"创建工单失败: {e}")
            return error_response("创建工单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"创建工单: {feedback.title} (ID: {feedback.id})")
        return success_response(data=self._serialize_feedback(feedback), message="创建成功")
    
    async def update_feedback(self, feedback_id: int, data: dict) -> Dict[str, Any]:
        """更新工单"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalars().first()
        
        if not feedback:
            return error_response("工单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        # 更新字段
        updatable_fields = ["title", "content", "status", "priority", "admin_reply"]
        for field in updatable_fields:
            if field in data:
                setattr(feedback, field, data[field])
        
        # 如果有管理员回复，更新回复时间
        if "admin_reply" in data and data["admin_reply"]:
            feedback.replied_at = datetime.now()
        
        try:
            await self.db.commit()
            await self.db.refresh(feedback)
        except Exception as e:
            await self.db.rollback()
            logger.error(f"更新工单失败: {e}")
            return error_response("更新工单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"更新工单: {feedback.id} -> {feedback.status}")
        return success_response(data=self._serialize_feedback(feedback), message="更新成功")
    
    async def delete_feedback(self, feedback_id: int) -> Dict[str, Any]:
        """删除工单"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalars().first()
        
        if not feedback:
            return error_response("工单不存在", ErrorCodes.RESOURCE_NOT_FOUND)
        
        try:
            await self.db.delete(feedback)
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            logger.error(f"删除工单失败: {e}")
            return error_response("删除工单失败", ErrorCodes.DATABASE_ERROR)
        
        logger.info(f"删除工单: {feedback.id}")
        return success_response(message="删除成功")
    
    async def get_feedback_stats(self) -> Dict[str, Any]:
        """获取工单统计"""
        # 各状态数量
        stats_result = await self.db.execute(
            select(
                func.count(Feedback.id),
                func.sum(func.case((Feedback.status == "pending", 1), else_=0)),
                func.sum(func.case((Feedback.status == "processing", 1), else_=0)),
                func.sum(func.case((Feedback.status == "resolved", 1), else_=0)),
            )
        )
        total, pending, processing, resolved = stats_result.one()
        
        return success_response(data={
            "total": total or 0,
            "pending": pending or 0,
            "processing": processing or 0,
            "resolved": resolved or 0,
        })
    
    def _serialize_feedback(self, feedback: Feedback, detailed: bool = False) -> dict:
        """序列化反馈对象"""
        data = {
            "id": feedback.id,
            "user_id": feedback.user_id,
            "title": feedback.title,
            "content": feedback.content,
            "status": feedback.status,
            "priority": feedback.priority,
            "admin_reply": feedback.admin_reply,
            "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
            "platform_key": feedback.platform_key,
            "capability_key": feedback.capability_key,
            "tool_id": feedback.tool_id,
        }
        
        if detailed:
            data["screenshot"] = feedback.screenshot
            data["screenshots"] = feedback.screenshots
            data["status_history"] = feedback.status_history
            data["replied_at"] = feedback.replied_at.isoformat() if feedback.replied_at else None
            data["updated_at"] = feedback.updated_at.isoformat() if feedback.updated_at else None
            data["run_log_id"] = feedback.run_log_id
        
        return data
