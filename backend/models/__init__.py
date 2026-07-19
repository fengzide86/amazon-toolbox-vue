"""
数据模型模块 - 统一导出所有模型和状态常量

模块化结构:
- base.py: Base 定义
- auth.py: 授权相关模型 (AuthCode, Device, AuthSeat, LaunchToken)
- user.py: 用户模型 (User)
- order.py: 订单相关模型 (Order, Plan, ProfitRecord)
- feedback.py: 反馈相关模型 (Feedback, RunLog)
- ai_chat.py: AI客服相关模型 (ChatSession, ChatMessage, ChatConfig, KnowledgeBase)
- system.py: 系统相关模型 (Setting, Announcement, AuditLog)
"""

# AI客服相关模型
from models.ai_chat import (
    ChatConfig,
    ChatMessage,
    ChatSession,
    ChatSessionStatus,
    KnowledgeBase,
    KnowledgeCategory,
)

# 授权相关模型
from models.auth import AuthCode, AuthCodeStatus, AuthSeat, Device, LaunchToken, LaunchTokenStatus
from models.automation import AutomationBatch, AutomationBatchItem
from models.base import Base
from models.demo import DemoBatch, DemoBatchItem, DemoRun

# 反馈相关模型
from models.feedback import ExecutionVerification, Feedback, FeedbackStatus, LogStatus, RunLog

# 订单相关模型
from models.order import Order, OrderStatus, Plan, PlanStatus, ProfitRecord, ProfitStatus

# 后台员工账号（与客户 User 完全分离）
from models.staff import StaffRole, StaffStatus, StaffUser

# 系统相关模型
from models.system import Announcement, AnnouncementReceipt, AnnouncementStatus, AuditLog, Setting

# 用户模型
from models.user import User

__all__ = [
    # Base
    "Base",
    # 状态常量
    "AuthCodeStatus",
    "OrderStatus",
    "PlanStatus",
    "ProfitStatus",
    "FeedbackStatus",
    "LogStatus",
    "ExecutionVerification",
    "ChatSessionStatus",
    "KnowledgeCategory",
    "AnnouncementStatus",
    "LaunchTokenStatus",
    "StaffRole",
    "StaffStatus",
    # 授权相关
    "AuthCode",
    "Device",
    "AuthSeat",
    "LaunchToken",
    # 用户
    "User",
    "StaffUser",
    "DemoRun",
    "DemoBatch",
    "DemoBatchItem",
    # 订单相关
    "Order",
    "Plan",
    "ProfitRecord",
    # 反馈相关
    "Feedback",
    "RunLog",
    # AI客服相关
    "KnowledgeBase",
    "ChatSession",
    "ChatMessage",
    "ChatConfig",
    # 系统相关
    "Setting",
    "Announcement",
    "AnnouncementReceipt",
    "AuditLog",
    "AutomationBatch",
    "AutomationBatchItem",
]
