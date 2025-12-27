from typing import List, Optional
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func

from app.core.database import get_db
from app.models.shift import Shift, ShiftStatus
from app.models.schedule import Schedule
from app.models.employee import Employee, EmployeeStatus
from app.models.availability import Availability
from app.models.time_off_request import TimeOffRequest, TimeOffStatus
from app.models.notification import Notification, NotificationType
from app.schemas.shift import (
    ShiftCreate, ShiftUpdate, ShiftResponse,
    CallOutCreate, CallOutResponse,
    ReplacementCandidate, AssignReplacementRequest, AssignReplacementResponse
)
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User
from app.services.compliance import ComplianceEngine, get_required_break_minutes

router = APIRouter()

MAX_WEEKLY_HOURS = 44


@router.get("/", response_model=List[ShiftResponse])
async def list_shifts(
    schedule_id: int = None,
    employee_id: int = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List shifts. Can filter by schedule_id or employee_id."""
    query = db.query(Shift)
    if schedule_id:
        query = query.filter(Shift.schedule_id == schedule_id)
    if employee_id:
        query = query.filter(Shift.employee_id == employee_id)
    shifts = query.order_by(Shift.date, Shift.start_time).offset(skip).limit(limit).all()
    return shifts


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(shift_id: int, db: Session = Depends(get_db)):
    """Get a specific shift by ID."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


@router.post("/", response_model=ShiftResponse, dependencies=[Depends(require_manager_or_admin)])
async def create_shift(
    shift_data: ShiftCreate,
    validate: bool = Query(True, description="Run compliance validation before creating"),
    force: bool = Query(False, description="Create even if compliance warnings exist"),
    db: Session = Depends(get_db)
):
    """
    Create a new shift (manager/admin only).

    By default, validates against compliance rules before creating.
    Set validate=false to skip validation.
    Set force=true to create despite warnings (errors still block).
    """
    # Verify schedule exists
    schedule = db.query(Schedule).filter(Schedule.id == shift_data.schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Create shift object for validation
    shift = Shift(**shift_data.model_dump())

    # Auto-calculate break if not appropriate
    from datetime import datetime
    start = datetime.combine(shift.date, shift.start_time)
    end = datetime.combine(shift.date, shift.end_time)
    total_hours = (end - start).total_seconds() / 3600
    required_break = get_required_break_minutes(total_hours)

    if shift.break_minutes < required_break:
        shift.break_minutes = required_break

    # Run compliance validation
    if validate:
        engine = ComplianceEngine(db)
        result = engine.validate_shift(shift)

        if not result.is_compliant:
            # Return detailed error with violations
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Shift violates compliance rules",
                    "violations": [v.to_dict() for v in result.violations],
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

        # If there are warnings and force is not set, return them
        if result.warnings and not force:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Shift has compliance warnings. Set force=true to create anyway.",
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.patch("/{shift_id}", response_model=ShiftResponse, dependencies=[Depends(require_manager_or_admin)])
async def update_shift(
    shift_id: int,
    shift_data: ShiftUpdate,
    validate: bool = Query(True, description="Run compliance validation before updating"),
    force: bool = Query(False, description="Update even if compliance warnings exist"),
    db: Session = Depends(get_db)
):
    """
    Update a shift (manager/admin only).

    By default, validates against compliance rules before updating.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Apply updates
    update_data = shift_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(shift, field, value)

    # Auto-calculate break if shift times changed
    if 'start_time' in update_data or 'end_time' in update_data:
        from datetime import datetime
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        total_hours = (end - start).total_seconds() / 3600
        required_break = get_required_break_minutes(total_hours)

        if shift.break_minutes < required_break:
            shift.break_minutes = required_break

    # Run compliance validation
    if validate:
        engine = ComplianceEngine(db)
        result = engine.validate_shift(shift)

        if not result.is_compliant:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Updated shift violates compliance rules",
                    "violations": [v.to_dict() for v in result.violations],
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

        if result.warnings and not force:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Updated shift has compliance warnings. Set force=true to update anyway.",
                    "warnings": [w.to_dict() for w in result.warnings]
                }
            )

    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_manager_or_admin)])
async def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    """Delete a shift (manager/admin only)."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    db.delete(shift)
    db.commit()


@router.get("/{shift_id}/compliance")
async def check_shift_compliance(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check compliance status for an existing shift.
    Returns violations, warnings, and compliance status.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    engine = ComplianceEngine(db)
    result = engine.validate_shift(shift)

    return {
        "shift_id": shift_id,
        "employee_id": shift.employee_id,
        "date": shift.date.isoformat(),
        **result.to_dict()
    }


# ==================== CALL-OUT MANAGEMENT ====================

def get_week_start(d: date) -> date:
    """Get the Monday of the week containing the given date."""
    return d - timedelta(days=d.weekday())


def get_employee_week_hours(db: Session, employee_id: int, week_start: date) -> float:
    """Calculate total hours an employee is scheduled for in a given week."""
    week_end = week_start + timedelta(days=6)

    shifts = db.query(Shift).filter(
        Shift.employee_id == employee_id,
        Shift.date >= week_start,
        Shift.date <= week_end,
        Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
    ).all()

    total_hours = 0.0
    for shift in shifts:
        total_hours += shift.duration_hours

    return total_hours


@router.get("/callouts", response_model=List[ShiftResponse], dependencies=[Depends(require_manager_or_admin)])
async def list_callouts(
    store_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    include_covered: bool = False,
    db: Session = Depends(get_db)
):
    """
    List all call-outs. Manager/admin only.

    By default shows only uncovered call-outs. Set include_covered=true to see all.
    """
    query = db.query(Shift).options(
        joinedload(Shift.employee),
        joinedload(Shift.original_employee),
        joinedload(Shift.covered_by),
        joinedload(Shift.schedule)
    )

    if include_covered:
        query = query.filter(Shift.status.in_([ShiftStatus.CALLED_OUT, ShiftStatus.COVERED]))
    else:
        query = query.filter(Shift.status == ShiftStatus.CALLED_OUT)

    if store_id:
        query = query.join(Schedule).filter(Schedule.store_id == store_id)

    if date_from:
        query = query.filter(Shift.date >= date_from)
    if date_to:
        query = query.filter(Shift.date <= date_to)

    # Default to today and future if no dates specified
    if not date_from and not date_to:
        query = query.filter(Shift.date >= date.today())

    return query.order_by(Shift.date, Shift.start_time).all()


@router.post("/{shift_id}/callout", response_model=CallOutResponse, dependencies=[Depends(require_manager_or_admin)])
async def mark_callout(
    shift_id: int,
    callout_data: CallOutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark a shift as a call-out. Manager/admin only.

    This records the call-out and makes the shift available for replacement.
    """
    shift = db.query(Shift).options(
        joinedload(Shift.employee),
        joinedload(Shift.schedule)
    ).filter(Shift.id == shift_id).first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if shift.status != ShiftStatus.SCHEDULED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark as call-out: shift is already {shift.status.value}"
        )

    # Record the call-out
    shift.status = ShiftStatus.CALLED_OUT
    shift.callout_reason = callout_data.reason
    shift.callout_time = datetime.now()
    shift.original_employee_id = shift.employee_id

    db.commit()
    db.refresh(shift)

    return CallOutResponse(
        shift_id=shift.id,
        status=shift.status.value,
        callout_reason=shift.callout_reason,
        callout_time=shift.callout_time,
        original_employee_id=shift.original_employee_id,
        message=f"Shift marked as call-out. Original employee: {shift.employee.first_name} {shift.employee.last_name}"
    )


@router.get("/{shift_id}/replacements", response_model=List[ReplacementCandidate], dependencies=[Depends(require_manager_or_admin)])
async def find_replacements(
    shift_id: int,
    db: Session = Depends(get_db)
):
    """
    Find available replacement candidates for a call-out shift.

    Returns employees sorted by suitability (available employees first, then by remaining hours).
    Checks:
    - Employee is active and in same store
    - Not already working that day
    - Not on approved time off
    - Has availability set for that day
    - Won't exceed 44hr weekly limit
    """
    shift = db.query(Shift).options(
        joinedload(Shift.schedule)
    ).filter(Shift.id == shift_id).first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if shift.status not in [ShiftStatus.CALLED_OUT, ShiftStatus.SCHEDULED]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot find replacements: shift status is {shift.status.value}"
        )

    store_id = shift.schedule.store_id
    shift_date = shift.date
    shift_hours = shift.duration_hours
    day_of_week = shift_date.weekday()
    week_start = get_week_start(shift_date)

    # Get all active employees in the same store (excluding original employee)
    employees = db.query(Employee).filter(
        Employee.store_id == store_id,
        Employee.status == EmployeeStatus.ACTIVE,
        Employee.id != shift.original_employee_id if shift.original_employee_id else Employee.id != shift.employee_id
    ).all()

    candidates = []

    for emp in employees:
        conflicts = []
        is_available = True
        availability_note = "Available"

        # Check if already working that day
        existing_shift = db.query(Shift).filter(
            Shift.employee_id == emp.id,
            Shift.date == shift_date,
            Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED]),
            Shift.id != shift_id
        ).first()

        if existing_shift:
            is_available = False
            conflicts.append(f"Already scheduled {existing_shift.start_time.strftime('%H:%M')}-{existing_shift.end_time.strftime('%H:%M')}")
            availability_note = "Already working"

        # Check time off
        time_off = db.query(TimeOffRequest).filter(
            TimeOffRequest.employee_id == emp.id,
            TimeOffRequest.status == TimeOffStatus.APPROVED,
            TimeOffRequest.start_date <= shift_date,
            TimeOffRequest.end_date >= shift_date
        ).first()

        if time_off:
            is_available = False
            conflicts.append("On approved time off")
            availability_note = "On time off"

        # Check availability preferences
        avail = db.query(Availability).filter(
            Availability.employee_id == emp.id,
            Availability.day_of_week == day_of_week
        ).first()

        if avail and not avail.is_available:
            is_available = False
            conflicts.append("Marked as unavailable for this day")
            availability_note = "Not available"
        elif avail and avail.preferred_start and avail.preferred_end:
            # Check if shift fits within preferred hours
            if shift.start_time < avail.preferred_start or shift.end_time > avail.preferred_end:
                conflicts.append(f"Outside preferred hours ({avail.preferred_start.strftime('%H:%M')}-{avail.preferred_end.strftime('%H:%M')})")

        # Calculate weekly hours
        current_week_hours = get_employee_week_hours(db, emp.id, week_start)
        remaining_hours = MAX_WEEKLY_HOURS - current_week_hours

        if current_week_hours + shift_hours > MAX_WEEKLY_HOURS:
            is_available = False
            conflicts.append(f"Would exceed 44hr limit ({current_week_hours + shift_hours:.1f}hrs)")
            availability_note = "Over hours limit"

        candidates.append(ReplacementCandidate(
            employee_id=emp.id,
            first_name=emp.first_name,
            last_name=emp.last_name,
            is_available=is_available,
            availability_note=availability_note,
            current_week_hours=round(current_week_hours, 1),
            remaining_hours=round(max(0, remaining_hours), 1),
            conflicts=conflicts
        ))

    # Sort: available first, then by remaining hours (descending)
    candidates.sort(key=lambda x: (not x.is_available, -x.remaining_hours))

    return candidates


@router.post("/{shift_id}/assign-replacement", response_model=AssignReplacementResponse, dependencies=[Depends(require_manager_or_admin)])
async def assign_replacement(
    shift_id: int,
    data: AssignReplacementRequest,
    force: bool = Query(False, description="Assign even if there are warnings"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Assign a replacement employee to cover a call-out shift.

    The shift status changes from 'called_out' to 'covered'.
    Both the original employee and replacement are notified.
    """
    shift = db.query(Shift).options(
        joinedload(Shift.employee),
        joinedload(Shift.schedule)
    ).filter(Shift.id == shift_id).first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if shift.status != ShiftStatus.CALLED_OUT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign replacement: shift status is {shift.status.value}, expected 'called_out'"
        )

    # Verify replacement employee exists and is in same store
    replacement = db.query(Employee).filter(
        Employee.id == data.replacement_employee_id
    ).first()

    if not replacement:
        raise HTTPException(status_code=404, detail="Replacement employee not found")

    if replacement.store_id != shift.schedule.store_id:
        raise HTTPException(status_code=400, detail="Replacement employee must be from the same store")

    if replacement.status != EmployeeStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Replacement employee is not active")

    # Run compliance check
    shift_hours = shift.duration_hours
    week_start = get_week_start(shift.date)
    current_hours = get_employee_week_hours(db, replacement.id, week_start)

    if current_hours + shift_hours > MAX_WEEKLY_HOURS and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Assigning this shift would put {replacement.first_name} at {current_hours + shift_hours:.1f} hours this week (max 44). Set force=true to override."
        )

    # Store original info before updating
    original_employee_id = shift.original_employee_id or shift.employee_id

    # Assign the replacement
    shift.status = ShiftStatus.COVERED
    shift.employee_id = replacement.id
    shift.covered_by_id = replacement.id
    if not shift.original_employee_id:
        shift.original_employee_id = original_employee_id

    # Create notifications
    # Notify the replacement
    replacement_notification = Notification(
        user_id=replacement.user_id,
        type=NotificationType.SHIFT_ASSIGNED,
        message=f"You've been assigned to cover a shift on {shift.date.strftime('%b %d')} ({shift.start_time.strftime('%H:%M')}-{shift.end_time.strftime('%H:%M')})"
    )
    db.add(replacement_notification)

    # Notify original employee that their shift is covered
    original_emp = db.query(Employee).filter(Employee.id == original_employee_id).first()
    if original_emp and original_emp.user_id:
        original_notification = Notification(
            user_id=original_emp.user_id,
            type=NotificationType.SHIFT_CHANGED,
            message=f"Your shift on {shift.date.strftime('%b %d')} has been covered by {replacement.first_name} {replacement.last_name}"
        )
        db.add(original_notification)

    db.commit()
    db.refresh(shift)

    return AssignReplacementResponse(
        shift_id=shift.id,
        status=shift.status.value,
        original_employee_id=original_employee_id,
        new_employee_id=replacement.id,
        covered_by_id=replacement.id,
        message=f"Shift now covered by {replacement.first_name} {replacement.last_name}"
    )


@router.post("/{shift_id}/revert-callout", response_model=ShiftResponse, dependencies=[Depends(require_manager_or_admin)])
async def revert_callout(
    shift_id: int,
    db: Session = Depends(get_db)
):
    """
    Revert a call-out back to scheduled status.

    Only works for shifts that haven't been covered yet.
    """
    shift = db.query(Shift).filter(Shift.id == shift_id).first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if shift.status == ShiftStatus.COVERED:
        raise HTTPException(
            status_code=400,
            detail="Cannot revert: shift has already been covered by another employee"
        )

    if shift.status != ShiftStatus.CALLED_OUT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot revert: shift status is {shift.status.value}"
        )

    # Revert to original state
    shift.status = ShiftStatus.SCHEDULED
    shift.callout_reason = None
    shift.callout_time = None

    # If original_employee_id was set, restore it
    if shift.original_employee_id:
        shift.employee_id = shift.original_employee_id
        shift.original_employee_id = None

    shift.covered_by_id = None

    db.commit()
    db.refresh(shift)

    return shift
