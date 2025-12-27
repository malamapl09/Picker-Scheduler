"""
Compliance API endpoints for validating labor rules.
"""

from typing import Dict, Any, List
from datetime import date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user, require_manager_or_admin
from app.models.user import User
from app.models.shift import Shift
from app.models.employee import Employee
from app.services.compliance import ComplianceEngine, get_required_break_minutes
from app.services.labor_standards import LaborStandardsService

router = APIRouter()


class ShiftValidationRequest(BaseModel):
    """Request body for validating a proposed shift."""
    employee_id: int
    date: date
    start_time: time
    end_time: time
    break_minutes: int = 30


class BulkShiftValidationRequest(BaseModel):
    """Request body for validating multiple shifts."""
    shifts: List[ShiftValidationRequest]


@router.post("/validate-shift")
async def validate_shift(
    shift_data: ShiftValidationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Validate a proposed shift against all compliance rules.

    Checks:
    - Weekly hours limit (44 hours)
    - Daily hours limit (8 hours)
    - Consecutive days limit (6 days)
    - Break requirements
    - Time off conflicts
    - Availability preferences
    - Shift overlaps
    """
    engine = ComplianceEngine(db)

    # Create a temporary shift object for validation
    shift = Shift(
        employee_id=shift_data.employee_id,
        date=shift_data.date,
        start_time=shift_data.start_time,
        end_time=shift_data.end_time,
        break_minutes=shift_data.break_minutes,
        schedule_id=0  # Temporary
    )

    result = engine.validate_shift(shift)
    return result.to_dict()


@router.post("/validate-shifts")
async def validate_multiple_shifts(
    request: BulkShiftValidationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Validate multiple proposed shifts at once.
    Useful for validating an entire schedule before saving.
    """
    engine = ComplianceEngine(db)
    all_results = []

    for shift_data in request.shifts:
        shift = Shift(
            employee_id=shift_data.employee_id,
            date=shift_data.date,
            start_time=shift_data.start_time,
            end_time=shift_data.end_time,
            break_minutes=shift_data.break_minutes,
            schedule_id=0
        )
        result = engine.validate_shift(shift)
        all_results.append({
            "employee_id": shift_data.employee_id,
            "date": shift_data.date.isoformat(),
            "result": result.to_dict()
        })

    # Aggregate results
    total_violations = sum(r["result"]["violation_count"] for r in all_results)
    total_warnings = sum(r["result"]["warning_count"] for r in all_results)

    return {
        "overall_compliant": total_violations == 0,
        "total_violations": total_violations,
        "total_warnings": total_warnings,
        "shift_results": all_results
    }


@router.get("/validate-schedule/{schedule_id}")
async def validate_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Validate an entire schedule for compliance violations.
    """
    engine = ComplianceEngine(db)
    result = engine.validate_schedule(schedule_id)
    return result.to_dict()


@router.get("/employee-status/{employee_id}")
async def get_employee_compliance_status(
    employee_id: int,
    week_start: date = Query(..., description="Monday of the week to check"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get compliance status summary for an employee for a specific week.

    Returns:
    - Total hours worked
    - Hours remaining
    - Days worked
    - Days remaining
    - List of scheduled shifts
    """
    engine = ComplianceEngine(db)
    return engine.get_employee_compliance_status(employee_id, week_start)


@router.get("/weekly-summary")
async def get_weekly_compliance_summary(
    store_id: int = Query(...),
    week_start: date = Query(..., description="Monday of the week to check"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get compliance summary for all employees at a store for a week.
    """
    engine = ComplianceEngine(db)

    # Get all employees at the store
    employees = db.query(Employee).filter(Employee.store_id == store_id).all()

    employee_statuses = []
    compliant_count = 0
    at_limit_count = 0

    for emp in employees:
        status = engine.get_employee_compliance_status(emp.id, week_start)
        employee_statuses.append(status)

        if status["hours_remaining"] > 0 and status["days_remaining"] > 0:
            compliant_count += 1
        if status["is_at_limit"]:
            at_limit_count += 1

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "total_employees": len(employees),
        "compliant_employees": compliant_count,
        "employees_at_limit": at_limit_count,
        "employee_statuses": employee_statuses
    }


@router.get("/labor-requirements")
async def get_labor_requirements(
    store_id: int = Query(...),
    target_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get labor requirements for a specific store and date.

    Returns hourly breakdown of required picker hours based on demand forecast.
    """
    service = LaborStandardsService(db)
    return service.estimate_staffing_for_day(store_id, target_date)


@router.get("/labor-requirements/weekly")
async def get_weekly_labor_requirements(
    store_id: int = Query(...),
    week_start: date = Query(..., description="Monday of the week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
) -> Dict[str, Any]:
    """
    Get labor requirements summary for an entire week.
    """
    service = LaborStandardsService(db)
    return service.get_weekly_summary(store_id, week_start)


@router.get("/break-requirements")
async def get_break_requirements(
    shift_hours: float = Query(..., ge=0, le=12)
) -> Dict[str, Any]:
    """
    Get required break time for a given shift length.
    """
    required_break = get_required_break_minutes(shift_hours)

    return {
        "shift_hours": shift_hours,
        "required_break_minutes": required_break,
        "rule": "30 min for 8hr shifts, 60 min for 9hr shifts"
    }


@router.get("/rules")
async def get_compliance_rules() -> Dict[str, Any]:
    """
    Get current compliance rules configuration.
    """
    from app.config import get_settings
    settings = get_settings()

    return {
        "max_hours_per_week": settings.max_hours_per_week,
        "max_hours_per_day": settings.max_hours_per_day,
        "max_consecutive_days": settings.days_on_per_week,
        "break_requirements": {
            "8_hour_shift": settings.break_minutes_8hr_shift,
            "9_hour_shift": settings.break_minutes_9hr_shift
        },
        "store_hours": {
            "open": settings.store_open_hour,
            "close": settings.store_close_hour
        }
    }
