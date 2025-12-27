from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

from app.models.schedule import ScheduleStatus


class ScheduleBase(BaseModel):
    store_id: int
    week_start_date: date


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    status: Optional[ScheduleStatus] = None


class ScheduleResponse(ScheduleBase):
    id: int
    status: ScheduleStatus
    created_by: int
    published_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduleWithShifts(ScheduleResponse):
    shifts: List["ShiftResponse"] = []

    class Config:
        from_attributes = True


# Import at end to avoid circular imports
from app.schemas.shift import ShiftResponse
ScheduleWithShifts.model_rebuild()
