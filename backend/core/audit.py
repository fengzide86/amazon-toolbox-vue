"""
审计日志工具模块
提供轻量级审计日志记录功能
"""
import json
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request

from models import AuditLog
from core.logging import get_logger

logger = get_logger(__name__)


async def log_admin_action(
    db: AsyncSession,
    user_id: Optional[int] = None,
    user_name: Optional[str] = None,
    action: str = "",
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[dict] = None,
    request: Optional[Request] = None,
):
    """
    记录管理员操作审计日志
    
    Args:
        db: 数据库会话
        user_id: 操作人ID
        user_name: 操作人名称
        action: 操作类型 (如: create_auth_code, update_faq)
        target_type: 目标类型 (如: auth_code, knowledge_base)
        target_id: 目标ID
        detail: 操作详情 (字典，将转为JSON)
        request: FastAPI请求对象 (用于获取IP和UA)
    """
    try:
        ip_address = None
        user_agent = None
        
        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")[:500]
        
        detail_json = json.dumps(detail, ensure_ascii=False) if detail else None
        
        audit_log = AuditLog(
            user_id=user_id,
            user_name=user_name,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            detail=detail_json,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        db.add(audit_log)
        await db.flush()  # 不提交，由调用方决定何时提交
        
        logger.debug(f"审计日志: {action} {target_type}:{target_id} by user:{user_name}")
        
    except Exception as e:
        # 审计日志失败不应影响主流程
        logger.error(f"审计日志记录失败: {e}")