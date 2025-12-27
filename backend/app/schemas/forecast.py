from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime


class OrderForecastBase(BaseModel):
    store_id: int
    date: date
    hour: int  # 0-23
    predicted_orders: float

    @field_validator("hour")
    @classmethod
    def validate_hour(cls, v):
        if v < 0 or v > 23:
            raise ValueError("hour must be between 0 and 23")
        return v


class OrderForecastCreate(OrderForecastBase):
    pass


class OrderForecastResponse(OrderForecastBase):
    id: int
    actual_orders: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True
