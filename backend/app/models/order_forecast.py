from sqlalchemy import Column, Integer, Float, ForeignKey, Date, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class OrderForecast(Base):
    __tablename__ = "order_forecasts"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    date = Column(Date, nullable=False)
    hour = Column(Integer, nullable=False)  # 0-23, representing hour of day
    predicted_orders = Column(Float, nullable=False)
    actual_orders = Column(Float)  # For tracking accuracy
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    store = relationship("Store", back_populates="order_forecasts")

    def __repr__(self):
        return f"<OrderForecast(store_id={self.store_id}, date={self.date}, hour={self.hour}, predicted={self.predicted_orders})>"
