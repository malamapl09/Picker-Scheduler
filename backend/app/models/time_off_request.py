from sqlalchemy import Column, Integer, String, ForeignKey, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class TimeOffStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    CANCELLED = "cancelled"


class TimeOffRequest(Base):
    __tablename__ = "time_off_requests"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(String(500))
    status = Column(SQLEnum(TimeOffStatus, values_callable=lambda obj: [e.value for e in obj]), default=TimeOffStatus.PENDING, nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", back_populates="time_off_requests")
    approver = relationship("User")

    def __repr__(self):
        return f"<TimeOffRequest(id={self.id}, employee_id={self.employee_id}, {self.start_date} to {self.end_date}, status={self.status})>"
