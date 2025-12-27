from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.core.database import Base


class SwapStatus(str, enum.Enum):
    PENDING = "pending"          # Posted for swap, waiting for someone to accept
    ACCEPTED = "accepted"        # Someone accepted, waiting for manager approval
    APPROVED = "approved"        # Manager approved, swap executed
    DENIED = "denied"            # Manager denied
    CANCELLED = "cancelled"      # Requester cancelled


class ShiftSwap(Base):
    __tablename__ = "shift_swaps"

    id = Column(Integer, primary_key=True, index=True)
    requester_shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    requested_shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)  # Null for open swaps
    notes = Column(String(500), nullable=True)
    status = Column(SQLEnum(SwapStatus, values_callable=lambda obj: [e.value for e in obj]), default=SwapStatus.PENDING, nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    requester_shift = relationship(
        "Shift", foreign_keys=[requester_shift_id], back_populates="swap_requests_as_requester"
    )
    requested_shift = relationship(
        "Shift", foreign_keys=[requested_shift_id], back_populates="swap_requests_as_requested"
    )
    approver = relationship("User")

    def __repr__(self):
        return f"<ShiftSwap(id={self.id}, requester_shift={self.requester_shift_id}, requested_shift={self.requested_shift_id}, status={self.status})>"
