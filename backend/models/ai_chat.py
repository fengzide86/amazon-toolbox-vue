"""
AI客服相关数据模型
包含: KnowledgeBase, ChatSession, ChatMessage, ChatConfig
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, Boolean, func
from models.base import Base


# ===== 状态常量 =====
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

class KnowledgeBase(Base):
    """知识库"""
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
    
    # ===== 1.5 新增字段 =====
    platform_key = Column(String(50), nullable=True, index=True)  # amazon / aliexpress / null=全平台
    capability_key = Column(String(100), nullable=True, index=True)  # 工具能力key / null=平台通用

    __table_args__ = (
        Index('ix_knowledge_category_status', 'category', 'status'),
        Index('ix_knowledge_platform', 'platform_key', 'status'),
    )


class ChatSession(Base):
    """AI对话会话"""
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
    
    # ===== 1.5 新增字段 =====
    platform_key = Column(String(50), nullable=True, index=True)  # amazon / aliexpress
    capability_key = Column(String(100), nullable=True, index=True)  # 工具能力key

    __table_args__ = (
        Index('ix_chat_sessions_user_status', 'user_id', 'status'),
        Index('ix_chat_sessions_platform', 'platform_key', 'created_at'),
    )


class ChatMessage(Base):
    """AI对话消息"""
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


class ChatConfig(Base):
    """AI客服配置"""
    __tablename__ = "chat_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    description = Column(String(200), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())