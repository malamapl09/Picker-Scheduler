from typing import List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.schedule import Schedule, ScheduleStatus
from app.models.shift import Shift
from app.models.notification import Notification, NotificationType
from app.schemas.schedule import ScheduleCreate, ScheduleUpdate, ScheduleResponse, ScheduleWithShifts
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User
from app.services.compliance import ComplianceEngine

router = APIRouter()


@router.get("/", response_model=List[ScheduleResponse])
async def list_schedules(
    store_id: int = None,
    status: ScheduleStatus = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List schedules. Can filter by store_id and status."""
    query = db.query(Schedule)
    if store_id:
        query = query.filter(Schedule.store_id == store_id)
    if status:
        query = query.filter(Schedule.status == status)
    schedules = query.order_by(Schedule.week_start_date.desc()).offset(skip).limit(limit).all()
    return schedules


@router.get("/{schedule_id}", response_model=ScheduleWithShifts)
async def get_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Get a specific schedule by ID with all shifts."""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.post("/", response_model=ScheduleResponse, dependencies=[Depends(require_manager_or_admin)])
async def create_schedule(
    schedule_data: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new schedule (manager/admin only)."""
    # Check if schedule already exists for this store and week
    existing = db.query(Schedule).filter(
        Schedule.store_id == schedule_data.store_id,
        Schedule.week_start_date == schedule_data.week_start_date
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Schedule already exists for this store and week"
        )

    schedule = Schedule(
        **schedule_data.model_dump(),
        created_by=current_user.id
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.get("/{schedule_id}/compliance")
async def check_schedule_compliance(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Check compliance status for an entire schedule.

    Returns detailed violations and warnings for all shifts in the schedule.
    """
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    engine = ComplianceEngine(db)
    result = engine.validate_schedule(schedule_id)

    return {
        "schedule_id": schedule_id,
        "store_id": schedule.store_id,
        "week_start": schedule.week_start_date.isoformat(),
        "status": schedule.status.value,
        **result.to_dict()
    }


@router.post("/{schedule_id}/publish", response_model=ScheduleResponse, dependencies=[Depends(require_manager_or_admin)])
async def publish_schedule(
    schedule_id: int,
    validate: bool = Query(True, description="Run compliance validation before publishing"),
    force: bool = Query(False, description="Publish even with warnings (errors still block)"),
    db: Session = Depends(get_db)
):
    """
    Publish a schedule (manager/admin only).

    By default, validates all shifts against compliance rules before publishing.
    Schedules with compliance errors cannot be published.
    Schedules with warnings can be published with force=true.
    """
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule.status == ScheduleStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Schedule is already published"
        )

    # Check if schedule has any shifts
    shift_count = db.query(Shift).filter(Shift.schedule_id == schedule_id).count()
    if shift_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish an empty schedule"
        )

    # Run compliance validation
    if validate:
        engine = ComplianceEngine(db)
        result = engine.validate_schedule(schedule_id)

        if not result.is_compliant:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Schedule has compliance violations and cannot be published",
                    "violations": [v.to_dict() for v in result.violations],
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

        if result.warnings and not force:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Schedule has compliance warnings. Set force=true to publish anyway.",
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

    # Publish the schedule
    schedule.status = ScheduleStatus.PUBLISHED
    schedule.published_at = datetime.utcnow()

    # Create notifications for all affected employees
    shifts = db.query(Shift).filter(Shift.schedule_id == schedule_id).all()
    notified_employees = set()

    for shift in shifts:
        if shift.employee_id not in notified_employees:
            notification = Notification(
                user_id=shift.employee.user_id,
                message=f"Schedule for week of {schedule.week_start_date.strftime('%b %d')} has been published",
                type=NotificationType.SCHEDULE_PUBLISHED
            )
            db.add(notification)
            notified_employees.add(shift.employee_id)

    db.commit()
    db.refresh(schedule)

    return schedule


@router.post("/{schedule_id}/unpublish", response_model=ScheduleResponse, dependencies=[Depends(require_manager_or_admin)])
async def unpublish_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """
    Revert a published schedule back to draft status (manager/admin only).

    Use with caution - employees may have already seen the published schedule.
    """
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule.status != ScheduleStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Schedule is not published"
        )

    schedule.status = ScheduleStatus.DRAFT
    schedule.published_at = None
    db.commit()
    db.refresh(schedule)

    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_manager_or_admin)])
async def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a draft schedule (manager/admin only)."""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule.status == ScheduleStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a published schedule"
        )

    db.delete(schedule)
    db.commit()
