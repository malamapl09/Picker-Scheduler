from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class NotificationType(str, enum.Enum):
    SCHEDULE_PUBLISHED = "schedule_published"
    SHIFT_ASSIGNED = "shift_assigned"
    SHIFT_CHANGED = "shift_changed"
    SWAP_REQUESTED = "swap_requested"
    SWAP_APPROVED = "swap_approved"
    SWAP_DENIED = "swap_denied"
    TIME_OFF_APPROVED = "time_off_approved"
    TIME_OFF_DENIED = "time_off_denied"
    COMPLIANCE_WARNING = "compliance_warning"
    GENERAL = "general"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String(500), nullable=False)
    type = Column(SQLEnum(NotificationType, values_callable=lambda obj: [e.value for e in obj]), default=NotificationType.GENERAL, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="notifications")

    def __repr__(self):
        return f"<Notification(id={self.id}, user_id={self.user_id}, type={self.type}, read={self.is_read})>"
