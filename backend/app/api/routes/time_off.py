from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.time_off_request import TimeOffRequest, TimeOffStatus
from app.schemas.time_off import TimeOffRequestCreate, TimeOffRequestUpdate, TimeOffRequestResponse
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[TimeOffRequestResponse])
async def list_time_off_requests(
    employee_id: int = None,
    status: TimeOffStatus = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List time off requests. Can filter by employee_id and status."""
    query = db.query(TimeOffRequest)
    if employee_id:
        query = query.filter(TimeOffRequest.employee_id == employee_id)
    if status:
        query = query.filter(TimeOffRequest.status == status)
    requests = query.order_by(TimeOffRequest.start_date).offset(skip).limit(limit).all()
    return requests


@router.post("/", response_model=TimeOffRequestResponse)
async def create_time_off_request(
    request_data: TimeOffRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new time off request."""
    time_off = TimeOffRequest(**request_data.model_dump())
    db.add(time_off)
    db.commit()
    db.refresh(time_off)
    return time_off


@router.patch("/{request_id}", response_model=TimeOffRequestResponse, dependencies=[Depends(require_manager_or_admin)])
async def update_time_off_request(
    request_id: int,
    request_data: TimeOffRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve or deny a time off request (manager/admin only)."""
    time_off = db.query(TimeOffRequest).filter(TimeOffRequest.id == request_id).first()
    if not time_off:
        raise HTTPException(status_code=404, detail="Time off request not found")

    if time_off.status != TimeOffStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update pending requests"
        )

    time_off.status = request_data.status
    time_off.approved_by = current_user.id
    time_off.approved_at = datetime.utcnow()

    db.commit()
    db.refresh(time_off)

    # TODO: Create notification for employee

    return time_off
