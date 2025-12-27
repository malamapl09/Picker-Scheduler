from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from app.models.employee import EmployeeStatus


class EmployeeBase(BaseModel):
    first_name: str
    last_name: str
    store_id: int
    hire_date: date
    status: EmployeeStatus = EmployeeStatus.ACTIVE


class EmployeeCreate(EmployeeBase):
    user_id: int


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    store_id: Optional[int] = None
    status: Optional[EmployeeStatus] = None


class EmployeeResponse(EmployeeBase):
    id: int
    user_id: int
    full_name: str
    created_at: datetime

    class Config:
        from_attributes = True
