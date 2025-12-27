from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class LaborStandard(Base):
    __tablename__ = "labor_standards"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), unique=True, nullable=False)
    orders_per_picker_hour = Column(Float, default=10.0, nullable=False)
    min_shift_hours = Column(Integer, default=4, nullable=False)
    max_shift_hours = Column(Integer, default=8, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    store = relationship("Store", back_populates="labor_standard")

    def calculate_required_picker_hours(self, predicted_orders: float) -> float:
        """Calculate required picker hours for a given order volume."""
        if self.orders_per_picker_hour <= 0:
            return 0
        return predicted_orders / self.orders_per_picker_hour

    def __repr__(self):
        return f"<LaborStandard(store_id={self.store_id}, orders_per_hour={self.orders_per_picker_hour})>"
