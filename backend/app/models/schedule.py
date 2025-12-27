from sqlalchemy import Column, Integer, ForeignKey, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class ScheduleStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    week_start_date = Column(Date, nullable=False)  # Always a Monday
    status = Column(SQLEnum(ScheduleStatus, values_callable=lambda obj: [e.value for e in obj]), default=ScheduleStatus.DRAFT, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    store = relationship("Store", back_populates="schedules")
    creator = relationship("User")
    shifts = relationship("Shift", back_populates="schedule", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Schedule(id={self.id}, store_id={self.store_id}, week={self.week_start_date}, status={self.status})>"
