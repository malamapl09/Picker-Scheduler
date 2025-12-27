from pydantic import BaseModel
from datetime import datetime

from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    message: str
    type: NotificationType
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationUpdate(BaseModel):
    is_read: bool
