from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from app.models.time_off_request import TimeOffStatus


class TimeOffRequestBase(BaseModel):
    start_date: date
    end_date: date
    reason: Optional[str] = None


class TimeOffRequestCreate(TimeOffRequestBase):
    employee_id: int


class TimeOffRequestUpdate(BaseModel):
    status: TimeOffStatus


class TimeOffRequestResponse(TimeOffRequestBase):
    id: int
    employee_id: int
    status: TimeOffStatus
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
