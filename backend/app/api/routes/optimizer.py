"""
Schedule Optimizer API endpoints.

Provides endpoints for generating optimized schedules using OR-Tools.
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User
from app.models.store import Store
from app.models.schedule import Schedule, ScheduleStatus
from app.services.optimizer import ScheduleOptimizer, OptimizationStatus, LockedShift, ManualOverride
from app.services.compliance import ComplianceEngine
from app.config import get_settings

settings = get_settings()

router = APIRouter()


class LockedShiftRequest(BaseModel):
    """A shift that must be included in the schedule."""
    employee_id: int
    day_index: int = Field(..., ge=0, le=6, description="Day of week (0=Monday, 6=Sunday)")
    shift_template_idx: int = Field(..., ge=0, le=7, description="Shift template index (0-7)")
    reason: str = Field("", description="Reason for locking this shift")


class ManualOverrideRequest(BaseModel):
    """Manual constraint for an employee-day combination."""
    employee_id: int
    day_index: int = Field(..., ge=0, le=6, description="Day of week (0=Monday, 6=Sunday)")
    must_work: bool = Field(False, description="Employee MUST work this day")
    cannot_work: bool = Field(False, description="Employee CANNOT work this day")
    preferred_shift_idx: Optional[int] = Field(None, ge=0, le=7, description="Preferred shift if must_work")
    reason: str = Field("", description="Reason for this override")


class OptimizeRequest(BaseModel):
    """Request body for schedule optimization."""
    store_id: int
    week_start: date = Field(..., description="Monday of the target week")
    timeout_seconds: int = Field(60, ge=10, le=300, description="Max optimization time")
    min_coverage_percent: float = Field(0.9, ge=0.5, le=1.0, description="Minimum demand coverage target")
    apply_immediately: bool = Field(False, description="Create schedule in database if successful")
    locked_shifts: List[LockedShiftRequest] = Field(default_factory=list, description="Shifts that MUST be included")
    manual_overrides: List[ManualOverrideRequest] = Field(default_factory=list, description="Manual constraints")


class OptimizeResponse(BaseModel):
    """Response from schedule optimization."""
    status: str
    message: str
    shifts: List[Dict[str, Any]]
    stats: Dict[str, Any]
    warnings: List[str]
    schedule_id: Optional[int] = None


@router.post("/generate", response_model=OptimizeResponse)
async def generate_schedule(
    request: OptimizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Generate an optimized schedule for a store and week.

    Uses Google OR-Tools CP-SAT solver to create shifts that:
    - Match staffing levels to forecasted demand
    - Respect all compliance rules (44hr/week, 8hr/day, 6-on-1-off)
    - Consider employee availability and time-off requests
    - Distribute shifts fairly among employees

    Set apply_immediately=true to create the schedule in the database,
    or false to preview the optimization results first.
    """
    # Validate store exists
    store = db.query(Store).filter(Store.id == request.store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Validate week_start is a Monday
    if request.week_start.weekday() != 0:
        raise HTTPException(
            status_code=400,
            detail="week_start must be a Monday"
        )

    # Check for existing published schedule
    existing = db.query(Schedule).filter(
        Schedule.store_id == request.store_id,
        Schedule.week_start_date == request.week_start,
        Schedule.status == ScheduleStatus.PUBLISHED
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="A published schedule already exists for this week. Unpublish it first."
        )

    # Convert request models to dataclasses
    locked_shifts = [
        LockedShift(
            employee_id=ls.employee_id,
            day_index=ls.day_index,
            shift_template_idx=ls.shift_template_idx,
            reason=ls.reason
        )
        for ls in request.locked_shifts
    ]

    manual_overrides = [
        ManualOverride(
            employee_id=mo.employee_id,
            day_index=mo.day_index,
            must_work=mo.must_work,
            cannot_work=mo.cannot_work,
            preferred_shift_idx=mo.preferred_shift_idx,
            reason=mo.reason
        )
        for mo in request.manual_overrides
    ]

    # Run optimization
    optimizer = ScheduleOptimizer(db)
    result = optimizer.optimize(
        store_id=request.store_id,
        week_start=request.week_start,
        timeout_seconds=request.timeout_seconds,
        min_coverage_percent=request.min_coverage_percent,
        locked_shifts=locked_shifts,
        manual_overrides=manual_overrides
    )

    response = result.to_dict()
    response["schedule_id"] = None

    # Apply to database if requested and successful
    if request.apply_immediately and result.status in [OptimizationStatus.OPTIMAL, OptimizationStatus.FEASIBLE]:
        if result.shifts:
            schedule, shifts = optimizer.apply_schedule(
                store_id=request.store_id,
                week_start=request.week_start,
                shifts=result.shifts,
                created_by=current_user.id
            )
            response["schedule_id"] = schedule.id
            response["message"] += f" - Created schedule #{schedule.id} with {len(shifts)} shifts"

    return response


@router.post("/preview")
async def preview_optimization(
    store_id: int = Query(...),
    week_start: date = Query(..., description="Monday of the target week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Quick preview of what optimization would produce.

    Same as /generate but with shorter timeout and never applies to database.
    Useful for checking feasibility before committing.
    """
    if week_start.weekday() != 0:
        raise HTTPException(status_code=400, detail="week_start must be a Monday")

    optimizer = ScheduleOptimizer(db)
    result = optimizer.optimize(
        store_id=store_id,
        week_start=week_start,
        timeout_seconds=30,  # Shorter timeout for preview
        min_coverage_percent=0.8
    )

    return result.to_dict()


@router.post("/apply")
async def apply_optimized_schedule(
    store_id: int = Query(...),
    week_start: date = Query(...),
    shifts: List[Dict[str, Any]] = [],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Apply a previously generated optimization result to the database.

    Use this after previewing with /generate (apply_immediately=false)
    to create the actual schedule.
    """
    if not shifts:
        raise HTTPException(status_code=400, detail="No shifts provided")

    optimizer = ScheduleOptimizer(db)
    schedule, created_shifts = optimizer.apply_schedule(
        store_id=store_id,
        week_start=week_start,
        shifts=shifts,
        created_by=current_user.id
    )

    return {
        "message": f"Created schedule #{schedule.id} with {len(created_shifts)} shifts",
        "schedule_id": schedule.id,
        "shift_count": len(created_shifts)
    }


@router.get("/shift-templates")
async def get_shift_templates() -> Dict[str, Any]:
    """
    Get available shift templates used by the optimizer.

    Returns the predefined shift patterns that can be assigned.
    """
    from app.services.optimizer import ScheduleOptimizer

    templates = []
    for i, template in enumerate(ScheduleOptimizer.SHIFT_TEMPLATES):
        templates.append({
            "id": i,
            "start_time": f"{template.start_hour:02d}:00",
            "end_time": f"{template.end_hour:02d}:00",
            "duration_hours": template.duration_hours,
            "break_minutes": template.break_minutes,
            "working_hours": template.working_hours
        })

    return {
        "templates": templates,
        "note": "These are the shift patterns the optimizer can assign"
    }


@router.get("/capacity")
async def get_scheduling_capacity(
    store_id: int = Query(...),
    week_start: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get the scheduling capacity for a store and week.

    Shows available employee hours vs. required demand hours.
    Useful for understanding if optimization will succeed.
    """
    from app.models.employee import Employee, EmployeeStatus
    from app.services.labor_standards import LaborStandardsService

    # Get employees
    employees = db.query(Employee).filter(
        Employee.store_id == store_id,
        Employee.status == EmployeeStatus.ACTIVE
    ).all()

    # Calculate capacity
    max_weekly_hours = settings.max_hours_per_week
    total_capacity = len(employees) * max_weekly_hours

    # Get demand
    labor_service = LaborStandardsService(db)
    summary = labor_service.get_weekly_summary(store_id, week_start)

    demand_hours = summary.get("total_required_hours", 0)

    # Calculate utilization needed
    utilization_needed = (demand_hours / total_capacity * 100) if total_capacity > 0 else 0

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "employee_count": len(employees),
        "max_hours_per_employee": max_weekly_hours,
        "total_capacity_hours": total_capacity,
        "demand_hours": demand_hours,
        "utilization_needed_percent": round(utilization_needed, 1),
        "feasibility": "likely" if utilization_needed < 85 else ("possible" if utilization_needed < 100 else "unlikely"),
        "note": "Feasibility assumes all employees are available all days"
    }


@router.post("/fill-gaps")
async def fill_schedule_gaps(
    schedule_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Attempt to fill coverage gaps in an existing schedule.

    Analyzes current coverage and tries to add shifts to meet demand
    without violating compliance rules.
    """
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if schedule.status == ScheduleStatus.PUBLISHED:
        raise HTTPException(status_code=400, detail="Cannot modify a published schedule")

    # Run optimization targeting gaps
    optimizer = ScheduleOptimizer(db)
    result = optimizer.optimize(
        store_id=schedule.store_id,
        week_start=schedule.week_start_date,
        timeout_seconds=60,
        min_coverage_percent=0.95
    )

    if result.status not in [OptimizationStatus.OPTIMAL, OptimizationStatus.FEASIBLE]:
        return {
            "message": "Could not find additional shifts to fill gaps",
            "status": result.status.value,
            "warnings": result.warnings
        }

    # Apply the optimized schedule (replaces existing)
    if result.shifts:
        schedule, shifts = optimizer.apply_schedule(
            store_id=schedule.store_id,
            week_start=schedule.week_start_date,
            shifts=result.shifts,
            created_by=current_user.id
        )

    return {
        "message": f"Updated schedule with {len(result.shifts)} shifts",
        "schedule_id": schedule.id,
        "stats": result.stats,
        "warnings": result.warnings
    }


@router.post("/lock-shift")
async def lock_existing_shift(
    shift_id: int = Query(..., description="ID of the shift to lock"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Lock an existing shift so it won't be modified by the optimizer.

    Returns the locked shift details that can be passed to /generate.
    """
    from app.models.shift import Shift

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Calculate day index from the shift date
    schedule = db.query(Schedule).filter(Schedule.id == shift.schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    day_index = (shift.date - schedule.week_start_date).days
    if day_index < 0 or day_index > 6:
        raise HTTPException(status_code=400, detail="Shift date is outside the schedule week")

    # Find matching shift template
    shift_template_idx = None
    for idx, template in enumerate(ScheduleOptimizer.SHIFT_TEMPLATES):
        if template.start_hour == shift.start_time.hour and template.end_hour == shift.end_time.hour:
            shift_template_idx = idx
            break

    if shift_template_idx is None:
        raise HTTPException(
            status_code=400,
            detail="Shift times don't match any standard template. Cannot lock."
        )

    return {
        "locked_shift": {
            "employee_id": shift.employee_id,
            "day_index": day_index,
            "shift_template_idx": shift_template_idx,
            "reason": f"Locked from existing shift #{shift_id}"
        },
        "message": f"Shift #{shift_id} can now be locked in optimization requests"
    }


@router.post("/employee-day-override")
async def set_employee_day_override(
    employee_id: int = Query(..., description="Employee ID"),
    day_index: int = Query(..., ge=0, le=6, description="Day of week (0=Mon, 6=Sun)"),
    action: str = Query(..., description="Action: 'must_work', 'cannot_work', or 'clear'"),
    preferred_shift_idx: Optional[int] = Query(None, ge=0, le=7, description="Preferred shift template if must_work"),
    reason: str = Query("", description="Reason for override"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Create a manual override for an employee on a specific day.

    Actions:
    - must_work: Employee MUST be scheduled this day
    - cannot_work: Employee CANNOT be scheduled this day
    - clear: Remove any override (returns empty override)

    Returns the override object that can be passed to /generate.
    """
    from app.models.employee import Employee

    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if action not in ["must_work", "cannot_work", "clear"]:
        raise HTTPException(
            status_code=400,
            detail="Action must be 'must_work', 'cannot_work', or 'clear'"
        )

    if action == "clear":
        return {
            "manual_override": None,
            "message": "Override cleared"
        }

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    override = {
        "employee_id": employee_id,
        "day_index": day_index,
        "must_work": action == "must_work",
        "cannot_work": action == "cannot_work",
        "preferred_shift_idx": preferred_shift_idx if action == "must_work" else None,
        "reason": reason or f"Manager override for {employee.full_name} on {day_names[day_index]}"
    }

    return {
        "manual_override": override,
        "message": f"Override created: {employee.full_name} {action.replace('_', ' ')} on {day_names[day_index]}"
    }


@router.get("/override-summary")
async def get_override_summary(
    store_id: int = Query(...),
    week_start: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get a summary of what overrides could be applied based on existing data.

    Analyzes:
    - Time-off requests (auto-generates cannot_work overrides)
    - Availability preferences (suggests overrides)
    - Existing shifts (identifies lockable shifts)
    """
    from app.models.employee import Employee, EmployeeStatus
    from app.models.time_off_request import TimeOffRequest, TimeOffStatus
    from app.models.shift import Shift

    week_end = week_start + timedelta(days=6)

    # Get employees
    employees = db.query(Employee).filter(
        Employee.store_id == store_id,
        Employee.status == EmployeeStatus.ACTIVE
    ).all()

    suggested_overrides = []
    lockable_shifts = []

    for emp in employees:
        # Check time-off requests
        time_offs = db.query(TimeOffRequest).filter(
            TimeOffRequest.employee_id == emp.id,
            TimeOffRequest.status == TimeOffStatus.APPROVED,
            TimeOffRequest.start_date <= week_end,
            TimeOffRequest.end_date >= week_start
        ).all()

        for to in time_offs:
            for day_offset in range(7):
                check_date = week_start + timedelta(days=day_offset)
                if to.start_date <= check_date <= to.end_date:
                    suggested_overrides.append({
                        "employee_id": emp.id,
                        "employee_name": emp.full_name,
                        "day_index": day_offset,
                        "cannot_work": True,
                        "must_work": False,
                        "reason": f"Approved time-off: {to.reason or 'No reason given'}"
                    })

    # Get existing shifts that could be locked
    existing_schedule = db.query(Schedule).filter(
        Schedule.store_id == store_id,
        Schedule.week_start_date == week_start
    ).first()

    if existing_schedule:
        shifts = db.query(Shift).filter(Shift.schedule_id == existing_schedule.id).all()
        for shift in shifts:
            day_index = (shift.date - week_start).days
            shift_template_idx = None
            for idx, template in enumerate(ScheduleOptimizer.SHIFT_TEMPLATES):
                if template.start_hour == shift.start_time.hour and template.end_hour == shift.end_time.hour:
                    shift_template_idx = idx
                    break

            if shift_template_idx is not None:
                lockable_shifts.append({
                    "shift_id": shift.id,
                    "employee_id": shift.employee_id,
                    "day_index": day_index,
                    "shift_template_idx": shift_template_idx,
                    "start_time": shift.start_time.isoformat(),
                    "end_time": shift.end_time.isoformat()
                })

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "suggested_overrides": suggested_overrides,
        "lockable_shifts": lockable_shifts,
        "employee_count": len(employees),
        "note": "Pass these to /generate in locked_shifts and manual_overrides arrays"
    }
