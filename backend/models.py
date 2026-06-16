from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, func, Index, Numeric, Boolean
from sqlalchemy.orm import relationship
from database import Base


# ===== 状态常量 =====
class AuthCodeStatus:
    """授权码状态"""
    UNUSED = "unused"      # 未使用
    ACTIVE = "active"      # 已激活
    FROZEN = "frozen"      # 已冻结
    EXPIRED = "expired"    # 已过期
    DELETED = "deleted"    # 已删除


class OrderStatus:
    """订单状态"""
    PENDING = "pending"    # 待确认
    PAID = "paid"          # 已付款
    REFUNDED = "refunded"  # 已退款


class PlanStatus:
    """套餐状态"""
    ACTIVE = "active"      # 启用
    DISABLED = "disabled"  # 禁用
    DELETED = "deleted"    # 已删除


class FeedbackStatus:
    """工单状态"""
    PENDING = "pending"        # 待处理
    PROCESSING = "processing"  # 处理中
    RESOLVED = "resolved"      # 已解决


class LogStatus:
    """日志状态"""
    SUCCESS = "success"    # 成功
    FAILED = "failed"      # 失败


class ChatSessionStatus:
    """对话会话状态"""
    ACTIVE = "active"          # 进行中
    RESOLVED = "resolved"      # 已解决
    TRANSFERRED = "transferred"  # 已转人工


class KnowledgeCategory:
    """知识库分类"""
    INSTALL = "安装教程"
    AUTH = "授权说明"
    USAGE = "使用教程"
    ERROR = "报错处理"
    PLAN = "套餐说明"
    REFUND = "退款规则"
    CONTEST = "比赛须知"
    OTHER = "其他"


# ===== 数据模型 =====

# 1. settings - 系统设置（键值对）
class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# 2. plans - 套餐
class Plan(Base):
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(precision=10, scale=2), nullable=False)
    duration_days = Column(Integer, nullable=False)
    features = Column(Text, nullable=True)  # JSON字符串
    status = Column(String(20), default="active", index=True)  # active/disabled/deleted
    code_prefix = Column(String(20), nullable=True)  # 授权码前缀，如 "SVIP"
    sort_order = Column(Integer, default=0)  # 排序权重
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_plans_status_sort', 'status', 'sort_order'),
    )


# 3. auth_codes - 授权码
class AuthCode(Base):
    __tablename__ = "auth_codes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True)
    device_name = Column(String(200), nullable=True)
    max_devices = Column(Integer, default=1)  # 最大设备数
    status = Column(String(20), default="unused", index=True)  # unused/active/frozen/expired
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # 关联设备列表
    devices = relationship("Device", backref="auth_code", lazy="selectin")

    __table_args__ = (
        Index('ix_auth_codes_status_expires', 'status', 'expires_at'),
    )

# 3b. devices - 设备绑定表
class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, autoincrement=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=False, index=True)
    device_id = Column(String(200), nullable=False, index=True)
    device_name = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index('ix_devices_auth_code_device', 'auth_code_id', 'device_id'),
    )


# 4. orders - 订单
class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_no = Column(String(100), unique=True, nullable=False, index=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True, index=True)
    amount = Column(Numeric(precision=10, scale=2), nullable=False)
    channel = Column(String(100), nullable=True)
    responsible = Column(String(100), nullable=True)
    status = Column(String(20), default="pending", index=True)  # pending/paid/refunded
    refund_amount = Column(Numeric(precision=10, scale=2), default=0)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    paid_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_orders_status_created', 'status', 'created_at'),
        Index('ix_orders_plan_status', 'plan_id', 'status'),
    )


# 5. users - 用户
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True, index=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True, index=True)
    device_name = Column(String(200), nullable=True)
    total_seats = Column(Integer, default=1)
    extra_devices = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)  # 是否活跃
    last_active_at = Column(DateTime, nullable=True)  # 最后活跃时间
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        Index('ix_users_auth_code_active', 'auth_code_id', 'is_active'),
    )


# 6. run_logs - 运行日志
class RunLog(Base):
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

    __table_args__ = (
        Index('ix_run_logs_user_created', 'user_id', 'created_at'),
        Index('ix_run_logs_tool_created', 'tool_name', 'created_at'),
    )


# 7. feedback - 工单/反馈
class Feedback(Base):
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
    
    __table_args__ = (
        Index('ix_feedback_status_created', 'status', 'created_at'),
        Index('ix_feedback_user_status', 'user_id', 'status'),
    )


# 8. profit_records - 分润记录
class ProfitRecord(Base):
    __tablename__ = "profit_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    tech_share = Column(Numeric(precision=10, scale=2), default=0)
    market_share = Column(Numeric(precision=10, scale=2), default=0)
    product_share = Column(Numeric(precision=10, scale=2), default=0)
    service_share = Column(Numeric(precision=10, scale=2), default=0)
    coordination_share = Column(Numeric(precision=10, scale=2), default=0)
    record_share = Column(Numeric(precision=10, scale=2), default=0)
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        Index('ix_profit_order', 'order_id'),
    )


# ===== AI 客服相关模型 =====

# 9. knowledge_base - 知识库
class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"
    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50), nullable=False, index=True)       # 分类
    title = Column(String(200), nullable=False)                     # 标题
    content = Column(Text, nullable=False)                          # 内容(Markdown)
    keywords = Column(Text, nullable=True)                          # 关键词(JSON数组)
    priority = Column(String(10), default="medium")                 # high/medium/low
    status = Column(String(20), default="active", index=True)       # active/disabled
    vector_id = Column(String(100), nullable=True)                  # ChromaDB向量ID
    view_count = Column(Integer, default=0)                         # 查看次数
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_knowledge_category_status', 'category', 'status'),
    )


# 10. chat_sessions - AI对话会话
class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(20), default="active", index=True)       # active/resolved/transferred
    message_count = Column(Integer, default=0)
    ai_resolved = Column(Boolean, default=False)                    # AI是否解决
    transferred_to_human = Column(Boolean, default=False)           # 是否转人工
    satisfaction = Column(Integer, nullable=True)                   # 满意度1-5
    created_at = Column(DateTime, server_default=func.now(), index=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index('ix_chat_sessions_user_status', 'user_id', 'status'),
    )


# 11. chat_messages - AI对话消息
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, index=True)
    role = Column(String(20), nullable=False)                       # user/ai/system
    content = Column(Text, nullable=False)
    knowledge_ids = Column(Text, nullable=True)                     # 引用的知识ID(JSON数组)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index('ix_chat_messages_session', 'session_id', 'created_at'),
    )


# 12. chat_config - AI客服配置
class ChatConfig(Base):
    __tablename__ = "chat_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(200), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ===== 公告系统 =====

class AnnouncementStatus:
    """公告状态"""
    DRAFT = "draft"        # 草稿
    PUBLISHED = "published"  # 已发布
    EXPIRED = "expired"    # 已过期


class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String(20), default="info", index=True)  # info/warning/success/urgent
    status = Column(String(20), default="draft", index=True)  # draft/published/expired
    priority = Column(Integer, default=0)  # 优先级，越大越靠前
    expires_at = Column(DateTime, nullable=True)  # 过期时间
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_announcements_status_priority', 'status', 'priority'),
    )
