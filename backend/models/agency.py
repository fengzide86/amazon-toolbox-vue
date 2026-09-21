"""Channel partners and pre-activation customer ownership (not internal profit)."""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, func

from models.base import Base


class Agency(Base):
    __tablename__ = "agencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="active", server_default="active")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    __table_args__ = (CheckConstraint("status IN ('active', 'disabled')", name="ck_agencies_status"),)


class AgencyCustomer(Base):
    __tablename__ = "agency_customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    contact = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class AgencyRequest(Base):
    __tablename__ = "agency_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("agency_customers.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True, index=True)
    kind = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open", server_default="open")
    response = Column(Text, nullable=True)
    created_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False)
    resolved_by_staff_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    __table_args__ = (
        CheckConstraint("kind IN ('support', 'refund', 'extension')", name="ck_agency_requests_kind"),
        CheckConstraint("status IN ('open', 'resolved', 'rejected')", name="ck_agency_requests_status"),
    )
