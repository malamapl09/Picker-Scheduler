from sqlalchemy import Column, Integer, String, Time, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import time

from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    address = Column(String(500))
    operating_start = Column(Time, default=time(8, 0))  # 8 AM
    operating_end = Column(Time, default=time(22, 0))   # 10 PM
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    employees = relationship("Employee", back_populates="store")
    schedules = relationship("Schedule", back_populates="store")
    order_forecasts = relationship("OrderForecast", back_populates="store")
    historical_orders = relationship("HistoricalOrder", back_populates="store")
    labor_standard = relationship("LaborStandard", back_populates="store", uselist=False)

    def __repr__(self):
        return f"<Store(id={self.id}, code={self.code}, name={self.name})>"
