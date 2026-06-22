"""
授权相关数据模型
包含: AuthCode, Device, AuthSeat, LaunchToken
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from models.base import Base


# ===== 状态常量 =====
class AuthCodeStatus:
    """授权码状态"""
    UNUSED = "unused"      # 未使用
    ACTIVE = "active"      # 已激活
    FROZEN = "frozen"      # 已冻结
    EXPIRED = "expired"    # 已过期
    DELETED = "deleted"    # 已删除


class LaunchTokenStatus:
    """启动令牌状态"""
    PENDING = "pending"      # 待使用
    USED = "used"            # 已使用
    EXPIRED = "expired"      # 已过期


# ===== 数据模型 =====

class AuthCode(Base):
    """授权码"""
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
    
    # ===== 1.5 新增字段 =====
    platform_scope = Column(Text, nullable=True)  # 平台权限: amazon / aliexpress / amazon,aliexpress
    scene_type = Column(String(50), nullable=True, index=True)  # 场景: competition / course
    seat_limit = Column(Integer, default=1)  # 席位数
    
    # 关联设备列表
    devices = relationship("Device", backref="auth_code", lazy="selectin")
    # 关联席位
    seats = relationship("AuthSeat", backref="auth_code", lazy="selectin")

    __table_args__ = (
        Index('ix_auth_codes_status_expires', 'status', 'expires_at'),
    )


class Device(Base):
    """设备绑定表"""
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, autoincrement=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=False, index=True)
    device_id = Column(String(200), nullable=False, index=True)
    device_name = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index('ix_devices_auth_code_device', 'auth_code_id', 'device_id'),
    )


class AuthSeat(Base):
    """席位绑定表 (1.5 新增)"""
    __tablename__ = "auth_seats"
    id = Column(Integer, primary_key=True, autoincrement=True)
    auth_code_id = Column(Integer, ForeignKey("auth_codes.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(200), nullable=True, index=True)
    device_name = Column(String(200), nullable=True)
    seat_no = Column(Integer, nullable=True)
    status = Column(String(20), default="active", index=True)  # active/inactive
    activated_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_auth_seats_code_status', 'auth_code_id', 'status'),
        Index('ix_auth_seats_user_device', 'user_id', 'device_id'),
    )


class LaunchToken(Base):
    """启动令牌 (1.5.1 Launch Token 权限兜底)"""
    __tablename__ = "launch_tokens"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False)
    auth_code_id = Column(Integer, nullable=False)
    platform_key = Column(String(50), nullable=False)
    tool_id = Column(String(100), nullable=False)
    script_key = Column(String(100), nullable=False)
    device_id = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (
        Index('ix_launch_tokens_expires', 'expires_at'),
    )