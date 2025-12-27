from pydantic import BaseModel
from typing import Optional
from datetime import time, datetime


class StoreBase(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    operating_start: time = time(8, 0)
    operating_end: time = time(22, 0)


class StoreCreate(StoreBase):
    pass


class StoreUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    operating_start: Optional[time] = None
    operating_end: Optional[time] = None


class StoreResponse(StoreBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
