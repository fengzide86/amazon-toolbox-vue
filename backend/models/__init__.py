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

# Base 定义
from models.base import Base

# 状态常量
from models.auth import AuthCodeStatus, LaunchTokenStatus
from models.order import OrderStatus, PlanStatus
from models.feedback import FeedbackStatus, LogStatus
from models.ai_chat import ChatSessionStatus, KnowledgeCategory
from models.system import AnnouncementStatus

# 授权相关模型
from models.auth import AuthCode, Device, AuthSeat, LaunchToken

# 用户模型
from models.user import User

# 订单相关模型
from models.order import Order, Plan, ProfitRecord

# 反馈相关模型
from models.feedback import Feedback, RunLog

# AI客服相关模型
from models.ai_chat import KnowledgeBase, ChatSession, ChatMessage, ChatConfig

# 系统相关模型
from models.system import Setting, Announcement, AuditLog

__all__ = [
    # Base
    "Base",
    # 状态常量
    "AuthCodeStatus",
    "OrderStatus",
    "PlanStatus",
    "FeedbackStatus",
    "LogStatus",
    "ChatSessionStatus",
    "KnowledgeCategory",
    "AnnouncementStatus",
    "LaunchTokenStatus",
    # 授权相关
    "AuthCode",
    "Device",
    "AuthSeat",
    "LaunchToken",
    # 用户
    "User",
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
    "AuditLog",
]