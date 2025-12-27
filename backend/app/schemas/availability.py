from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import time, datetime


class AvailabilityBase(BaseModel):
    day_of_week: int  # 0=Monday, 6=Sunday
    is_available: bool = True
    preferred_start: Optional[time] = None
    preferred_end: Optional[time] = None

    @field_validator("day_of_week")
    @classmethod
    def validate_day_of_week(cls, v):
        if v < 0 or v > 6:
            raise ValueError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
        return v


class AvailabilityCreate(AvailabilityBase):
    employee_id: int


class AvailabilityUpdate(BaseModel):
    is_available: Optional[bool] = None
    preferred_start: Optional[time] = None
    preferred_end: Optional[time] = None


class AvailabilityResponse(AvailabilityBase):
    id: int
    employee_id: int
    created_at: datetime

    class Config:
        from_attributes = True
