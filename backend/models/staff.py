"""Internal staff accounts and fixed role constants."""

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, func

from models.base import Base


class StaffRole:
    SUPER_ADMIN = "super_admin"
    OPERATOR = "operator"
    SUPPORT = "support"

    ALL = frozenset({SUPER_ADMIN, OPERATOR, SUPPORT})


class StaffStatus:
    ACTIVE = "active"
    DISABLED = "disabled"

    ALL = frozenset({ACTIVE, DISABLED})


class StaffUser(Base):
    """A back-office user. Customer identities remain in ``users``."""

    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    display_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=StaffRole.SUPPORT, index=True)
    status = Column(String(20), nullable=False, default=StaffStatus.ACTIVE, index=True)
    token_version = Column(Integer, nullable=False, default=1)
    force_password_reset = Column(Boolean, nullable=False, default=False)
    last_login_at = Column(DateTime, nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "role IN ('super_admin', 'operator', 'support')",
            name="ck_staff_users_role",
        ),
        CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_staff_users_status",
        ),
        CheckConstraint("token_version >= 1", name="ck_staff_users_token_version"),
        Index("ix_staff_users_role_status", "role", "status"),
    )
