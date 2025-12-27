from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.availability import Availability
from app.schemas.availability import AvailabilityCreate, AvailabilityUpdate, AvailabilityResponse
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/employee/{employee_id}", response_model=List[AvailabilityResponse])
async def get_employee_availability(
    employee_id: int,
    db: Session = Depends(get_db)
):
    """Get availability for an employee."""
    availability = db.query(Availability).filter(
        Availability.employee_id == employee_id
    ).order_by(Availability.day_of_week).all()
    return availability


@router.post("/", response_model=AvailabilityResponse)
async def create_availability(
    availability_data: AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create or update availability for a day."""
    # Check if availability already exists for this employee and day
    existing = db.query(Availability).filter(
        Availability.employee_id == availability_data.employee_id,
        Availability.day_of_week == availability_data.day_of_week
    ).first()

    if existing:
        # Update existing
        for field, value in availability_data.model_dump().items():
            setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return existing

    # Create new
    availability = Availability(**availability_data.model_dump())
    db.add(availability)
    db.commit()
    db.refresh(availability)
    return availability


@router.patch("/{availability_id}", response_model=AvailabilityResponse)
async def update_availability(
    availability_id: int,
    availability_data: AvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update availability."""
    availability = db.query(Availability).filter(Availability.id == availability_id).first()
    if not availability:
        raise HTTPException(status_code=404, detail="Availability not found")

    update_data = availability_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(availability, field, value)

    db.commit()
    db.refresh(availability)
    return availability
