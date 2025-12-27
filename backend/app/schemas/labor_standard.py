from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LaborStandardBase(BaseModel):
    store_id: int
    orders_per_picker_hour: float = 10.0
    min_shift_hours: int = 4
    max_shift_hours: int = 8


class LaborStandardCreate(LaborStandardBase):
    pass


class LaborStandardUpdate(BaseModel):
    orders_per_picker_hour: Optional[float] = None
    min_shift_hours: Optional[int] = None
    max_shift_hours: Optional[int] = None


class LaborStandardResponse(LaborStandardBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
