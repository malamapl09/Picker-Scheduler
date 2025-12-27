from sqlalchemy import Column, Integer, String, ForeignKey, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_LEAVE = "on_leave"


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    hire_date = Column(Date, nullable=False)
    status = Column(SQLEnum(EmployeeStatus, values_callable=lambda obj: [e.value for e in obj]), default=EmployeeStatus.ACTIVE, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="employee")
    store = relationship("Store", back_populates="employees")
    shifts = relationship("Shift", back_populates="employee", foreign_keys="Shift.employee_id")
    availability = relationship("Availability", back_populates="employee")
    time_off_requests = relationship("TimeOffRequest", back_populates="employee")

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def __repr__(self):
        return f"<Employee(id={self.id}, name={self.full_name}, store_id={self.store_id})>"
