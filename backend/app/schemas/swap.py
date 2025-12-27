from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, time

from app.models.shift_swap import SwapStatus


class ShiftSwapBase(BaseModel):
    requester_shift_id: int
    requested_shift_id: Optional[int] = None  # None means open swap (looking for any taker)
    notes: Optional[str] = None


class ShiftSwapCreate(ShiftSwapBase):
    pass


class ShiftSwapUpdate(BaseModel):
    status: SwapStatus


class ShiftSwapAccept(BaseModel):
    accepting_shift_id: int  # The shift the acceptor is offering in exchange


class EmployeeInfo(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class ShiftInfo(BaseModel):
    id: int
    employee_id: int
    date: date
    start_time: time
    end_time: time
    break_minutes: int
    employee: Optional[EmployeeInfo] = None

    class Config:
        from_attributes = True


class ShiftSwapResponse(BaseModel):
    id: int
    requester_shift_id: int
    requested_shift_id: Optional[int] = None
    status: SwapStatus
    notes: Optional[str] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    requester_shift: Optional[ShiftInfo] = None
    requested_shift: Optional[ShiftInfo] = None

    class Config:
        from_attributes = True


class ShiftSwapListResponse(BaseModel):
    id: int
    requester_shift_id: int
    requested_shift_id: Optional[int] = None
    status: SwapStatus
    notes: Optional[str] = None
    created_at: datetime
    requester_shift: Optional[ShiftInfo] = None
    requested_shift: Optional[ShiftInfo] = None

    class Config:
        from_attributes = True
