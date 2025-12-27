"""
Historical Order data model.

Stores actual historical order counts from Oracle/POS system
for use in demand forecasting.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, Date, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class HistoricalOrder(Base):
    """
    Historical order data used for demand forecasting.

    This table stores actual order counts by store, date, and hour,
    imported from the Oracle transaction system or POS data.
    """
    __tablename__ = "historical_orders"

    id = Column(Integer, primary_key=True, index=True)
    store_id = Column(Integer, ForeignKey("stores.id"), nullable=False)
    date = Column(Date, nullable=False)
    hour = Column(Integer, nullable=False)  # 0-23, representing hour of day
    order_count = Column(Float, nullable=False)  # Number of orders in this hour

    # Optional metadata
    day_of_week = Column(Integer)  # 0=Monday, 6=Sunday (for faster queries)
    is_holiday = Column(Integer, default=0)  # 1 if holiday, 0 otherwise

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    store = relationship("Store", back_populates="historical_orders")

    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_historical_orders_store_date', 'store_id', 'date'),
        Index('ix_historical_orders_store_dow_hour', 'store_id', 'day_of_week', 'hour'),
    )

    def __repr__(self):
        return f"<HistoricalOrder(store_id={self.store_id}, date={self.date}, hour={self.hour}, orders={self.order_count})>"
