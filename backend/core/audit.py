"""
审计日志工具模块
提供轻量级审计日志记录功能
"""
import json
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.logging import get_logger, get_request_id
from models import AuditLog

logger = get_logger(__name__)


async def log_admin_action(
    db: AsyncSession,
    user_id: int | None = None,
    user_name: str | None = None,
    action: str = "",
    target_type: str | None = None,
    target_id: str | int | None = None,
    detail: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
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
        
        normalized_detail = dict(detail or {})
        request_id = get_request_id()
        if request_id:
            normalized_detail.setdefault("request_id", request_id)
        detail_json = (
            json.dumps(normalized_detail, ensure_ascii=False, default=str)
            if normalized_detail
            else None
        )
        
        audit_log = AuditLog(
            user_id=user_id,
            user_name=user_name,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            detail=detail_json,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        db.add(audit_log)
        await db.flush()  # 不提交，由调用方决定何时提交
        
        logger.debug(f"审计日志: {action} {target_type}:{target_id} by user:{user_name}")
        
    except Exception as e:
        # 后台写操作必须与审计记录处于同一事务。审计失败后如果继续提交业务，
        # 数据会留下不可追溯的变更，因此让调用方回滚整个请求。
        logger.error(f"审计日志记录失败: {e}", exc_info=True)
        raise
