from sqlalchemy import Column, Integer, String, ForeignKey, Date, Time, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timedelta
import enum

from app.core.database import Base


class ShiftStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    CALLED_OUT = "called_out"
    COVERED = "covered"
    NO_SHOW = "no_show"


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_minutes = Column(Integer, default=30)  # 30 min for 8hr, 60 min for 9hr

    # Call-out management fields
    status = Column(SQLEnum(ShiftStatus, values_callable=lambda obj: [e.value for e in obj]), default=ShiftStatus.SCHEDULED, nullable=False)
    callout_reason = Column(String(500), nullable=True)
    callout_time = Column(DateTime(timezone=True), nullable=True)
    original_employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    covered_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    schedule = relationship("Schedule", back_populates="shifts")
    employee = relationship("Employee", back_populates="shifts", foreign_keys=[employee_id])
    original_employee = relationship("Employee", foreign_keys=[original_employee_id])
    covered_by = relationship("Employee", foreign_keys=[covered_by_id])
    swap_requests_as_requester = relationship(
        "ShiftSwap", foreign_keys="ShiftSwap.requester_shift_id", back_populates="requester_shift"
    )
    swap_requests_as_requested = relationship(
        "ShiftSwap", foreign_keys="ShiftSwap.requested_shift_id", back_populates="requested_shift"
    )

    @property
    def duration_hours(self) -> float:
        """Calculate shift duration in hours (excluding break)."""
        start = datetime.combine(self.date, self.start_time)
        end = datetime.combine(self.date, self.end_time)
        total_minutes = (end - start).total_seconds() / 60
        working_minutes = total_minutes - self.break_minutes
        return working_minutes / 60

    @property
    def total_hours(self) -> float:
        """Calculate total shift duration in hours (including break)."""
        start = datetime.combine(self.date, self.start_time)
        end = datetime.combine(self.date, self.end_time)
        return (end - start).total_seconds() / 3600

    def __repr__(self):
        return f"<Shift(id={self.id}, employee_id={self.employee_id}, date={self.date}, {self.start_time}-{self.end_time})>"
