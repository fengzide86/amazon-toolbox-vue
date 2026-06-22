"""
用户数据模型
包含: User
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Index, func
from models.base import Base


class User(Base):
    """用户"""
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