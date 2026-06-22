"""
反馈相关数据模型
包含: Feedback, RunLog
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, func
from models.base import Base


# ===== 状态常量 =====
class FeedbackStatus:
    """工单状态"""
    PENDING = "pending"        # 待处理
    PROCESSING = "processing"  # 处理中
    RESOLVED = "resolved"      # 已解决


class LogStatus:
    """日志状态"""
    SUCCESS = "success"    # 成功
    FAILED = "failed"      # 失败


# ===== 数据模型 =====

class RunLog(Base):
    """运行日志"""
    __tablename__ = "run_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True, index=True)
    tool_name = Column(String(200), nullable=True, index=True)
    module = Column(String(200), nullable=True)  # 如：物流模块、发货脚本
    status = Column(String(20), nullable=True)  # success/failed
    error_code = Column(String(100), nullable=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    
    # ===== 1.5 新增字段 =====
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=True, index=True)
    platform_key = Column(String(50), nullable=True, index=True)  # amazon / aliexpress
    capability_key = Column(String(100), nullable=True, index=True)  # register / listing / ads 等
    script_key = Column(String(100), nullable=True, index=True)  # amz_register / ae_register 等
    tool_id = Column(String(100), nullable=True, index=True)  # 工具配置ID

    __table_args__ = (
        Index('ix_run_logs_user_created', 'user_id', 'created_at'),
        Index('ix_run_logs_tool_created', 'tool_name', 'created_at'),
        Index('ix_run_logs_platform', 'platform_key', 'created_at'),
    )


class Feedback(Base):
    """工单/反馈"""
    __tablename__ = "feedback"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String(200), nullable=True)
    content = Column(Text, nullable=True)
    screenshot = Column(String(500), nullable=True)
    screenshots = Column(Text, nullable=True)  # JSON数组，多张截图
    status = Column(String(20), default="pending", index=True)  # pending/processing/resolved
    priority = Column(String(10), default="normal")  # low/normal/high/urgent
    status_history = Column(Text, nullable=True)  # 状态变更历史 JSON
    admin_reply = Column(Text, nullable=True)
    replied_at = Column(DateTime, nullable=True)  # 最后回复时间
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # ===== 1.5 新增字段 =====
    platform_key = Column(String(50), nullable=True, index=True)  # amazon / aliexpress
    capability_key = Column(String(100), nullable=True, index=True)  # 工具能力key
    tool_id = Column(String(100), nullable=True, index=True)  # 工具配置ID
    run_log_id = Column(Integer, ForeignKey("run_logs.id"), nullable=True, index=True)  # 关联日志
    
    __table_args__ = (
        Index('ix_feedback_status_created', 'status', 'created_at'),
        Index('ix_feedback_user_status', 'user_id', 'status'),
        Index('ix_feedback_platform', 'platform_key', 'created_at'),
    )