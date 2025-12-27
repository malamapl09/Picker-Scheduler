from pydantic import BaseModel
from typing import Optional, Literal
from datetime import date, time, datetime


ShiftStatusType = Literal["scheduled", "called_out", "covered", "no_show"]


class EmployeeBasic(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class ShiftBase(BaseModel):
    employee_id: int
    date: date
    start_time: time
    end_time: time
    break_minutes: int = 30


class ShiftCreate(ShiftBase):
    schedule_id: int


class ShiftUpdate(BaseModel):
    employee_id: Optional[int] = None
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: Optional[int] = None


class ShiftResponse(ShiftBase):
    id: int
    schedule_id: int
    status: ShiftStatusType = "scheduled"
    callout_reason: Optional[str] = None
    callout_time: Optional[datetime] = None
    original_employee_id: Optional[int] = None
    covered_by_id: Optional[int] = None
    duration_hours: float
    total_hours: float
    created_at: datetime
    employee: Optional[EmployeeBasic] = None
    original_employee: Optional[EmployeeBasic] = None
    covered_by: Optional[EmployeeBasic] = None

    class Config:
        from_attributes = True


# Call-out management schemas
class CallOutCreate(BaseModel):
    reason: Optional[str] = None


class CallOutResponse(BaseModel):
    shift_id: int
    status: ShiftStatusType
    callout_reason: Optional[str] = None
    callout_time: Optional[datetime] = None
    original_employee_id: int
    message: str


class ReplacementCandidate(BaseModel):
    employee_id: int
    first_name: str
    last_name: str
    is_available: bool
    availability_note: str
    current_week_hours: float
    remaining_hours: float  # Hours remaining before hitting 44hr limit
    conflicts: list[str] = []  # Any potential issues

    class Config:
        from_attributes = True


class AssignReplacementRequest(BaseModel):
    replacement_employee_id: int


class AssignReplacementResponse(BaseModel):
    shift_id: int
    status: ShiftStatusType
    original_employee_id: int
    new_employee_id: int
    covered_by_id: int
    message: str
