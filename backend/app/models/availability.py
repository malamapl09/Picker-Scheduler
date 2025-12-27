from sqlalchemy import Column, Integer, ForeignKey, Boolean, Time, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Availability(Base):
    __tablename__ = "availability"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    is_available = Column(Boolean, default=True)
    preferred_start = Column(Time)  # Preferred start time if available
    preferred_end = Column(Time)    # Preferred end time if available
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employee = relationship("Employee", back_populates="availability")

    def __repr__(self):
        return f"<Availability(employee_id={self.employee_id}, day={self.day_of_week}, available={self.is_available})>"
