"""
Compliance Engine

Enforces labor rules for picker scheduling:
- 44 hours per week maximum
- 8 hours per day maximum
- 6 days on, 1 day off pattern
- Break requirements based on shift length
"""

from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import date, time, datetime, timedelta
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.shift import Shift
from app.models.schedule import Schedule
from app.models.employee import Employee
from app.models.time_off_request import TimeOffRequest, TimeOffStatus
from app.models.availability import Availability
from app.config import get_settings

settings = get_settings()


class ViolationType(str, Enum):
    WEEKLY_HOURS_EXCEEDED = "weekly_hours_exceeded"
    DAILY_HOURS_EXCEEDED = "daily_hours_exceeded"
    CONSECUTIVE_DAYS_EXCEEDED = "consecutive_days_exceeded"
    INSUFFICIENT_BREAK = "insufficient_break"
    OUTSIDE_OPERATING_HOURS = "outside_operating_hours"
    TIME_OFF_CONFLICT = "time_off_conflict"
    AVAILABILITY_CONFLICT = "availability_conflict"
    SHIFT_OVERLAP = "shift_overlap"


class SeverityLevel(str, Enum):
    ERROR = "error"      # Blocks scheduling
    WARNING = "warning"  # Allows but flags
    INFO = "info"        # Informational only


@dataclass
class ComplianceViolation:
    """Represents a single compliance violation."""
    type: ViolationType
    severity: SeverityLevel
    message: str
    employee_id: int
    employee_name: Optional[str] = None
    date: Optional[date] = None
    details: Optional[Dict] = None

    def to_dict(self) -> Dict:
        return {
            "type": self.type.value,
            "severity": self.severity.value,
            "message": self.message,
            "employee_id": self.employee_id,
            "employee_name": self.employee_name,
            "date": self.date.isoformat() if self.date else None,
            "details": self.details
        }


@dataclass
class ComplianceResult:
    """Result of compliance validation."""
    is_compliant: bool
    violations: List[ComplianceViolation]
    warnings: List[ComplianceViolation]
    info: List[ComplianceViolation]

    def to_dict(self) -> Dict:
        return {
            "is_compliant": self.is_compliant,
            "violations": [v.to_dict() for v in self.violations],
            "warnings": [w.to_dict() for w in self.warnings],
            "info": [i.to_dict() for i in self.info],
            "violation_count": len(self.violations),
            "warning_count": len(self.warnings)
        }


class ComplianceEngine:
    """Engine for validating labor compliance rules."""

    def __init__(self, db: Session):
        self.db = db
        self.max_hours_per_week = settings.max_hours_per_week
        self.max_hours_per_day = settings.max_hours_per_day
        self.max_consecutive_days = settings.days_on_per_week
        self.break_minutes_8hr = settings.break_minutes_8hr_shift
        self.break_minutes_9hr = settings.break_minutes_9hr_shift

    def _get_shift_duration_hours(self, shift: Shift) -> float:
        """Calculate shift duration in hours (excluding break)."""
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        total_minutes = (end - start).total_seconds() / 60
        working_minutes = total_minutes - shift.break_minutes
        return working_minutes / 60

    def _get_shift_total_hours(self, shift: Shift) -> float:
        """Calculate total shift duration in hours (including break)."""
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        return (end - start).total_seconds() / 3600

    def _get_employee_name(self, employee_id: int) -> str:
        """Get employee full name."""
        employee = self.db.query(Employee).filter(Employee.id == employee_id).first()
        return employee.full_name if employee else f"Employee #{employee_id}"

    def validate_weekly_hours(
        self,
        employee_id: int,
        week_start: date,
        proposed_shifts: Optional[List[Shift]] = None
    ) -> List[ComplianceViolation]:
        """
        Validate that employee doesn't exceed 44 hours per week.

        Args:
            employee_id: Employee ID to validate
            week_start: Monday of the week to validate
            proposed_shifts: Optional list of proposed shifts to include in calculation
        """
        violations = []
        week_end = week_start + timedelta(days=6)

        # Get existing shifts for the week
        existing_shifts = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee_id,
            Shift.date >= week_start,
            Shift.date <= week_end
        ).all()

        # Calculate total hours
        total_hours = sum(self._get_shift_duration_hours(s) for s in existing_shifts)

        # Add proposed shifts
        if proposed_shifts:
            for shift in proposed_shifts:
                if shift.date >= week_start and shift.date <= week_end:
                    total_hours += self._get_shift_duration_hours(shift)

        if total_hours > self.max_hours_per_week:
            violations.append(ComplianceViolation(
                type=ViolationType.WEEKLY_HOURS_EXCEEDED,
                severity=SeverityLevel.ERROR,
                message=f"Weekly hours ({total_hours:.1f}) exceed maximum ({self.max_hours_per_week})",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                details={
                    "total_hours": round(total_hours, 2),
                    "max_hours": self.max_hours_per_week,
                    "excess_hours": round(total_hours - self.max_hours_per_week, 2),
                    "week_start": week_start.isoformat()
                }
            ))
        elif total_hours > self.max_hours_per_week - 4:
            # Warning when approaching limit (within 4 hours)
            violations.append(ComplianceViolation(
                type=ViolationType.WEEKLY_HOURS_EXCEEDED,
                severity=SeverityLevel.WARNING,
                message=f"Approaching weekly hour limit ({total_hours:.1f}/{self.max_hours_per_week})",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                details={
                    "total_hours": round(total_hours, 2),
                    "max_hours": self.max_hours_per_week,
                    "remaining_hours": round(self.max_hours_per_week - total_hours, 2)
                }
            ))

        return violations

    def validate_daily_hours(
        self,
        employee_id: int,
        target_date: date,
        proposed_shift: Optional[Shift] = None
    ) -> List[ComplianceViolation]:
        """
        Validate that employee doesn't exceed 8 hours per day.
        """
        violations = []

        # Get existing shifts for the day
        existing_shifts = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee_id,
            Shift.date == target_date
        ).all()

        # Calculate total hours
        total_hours = sum(self._get_shift_duration_hours(s) for s in existing_shifts)

        if proposed_shift and proposed_shift.date == target_date:
            total_hours += self._get_shift_duration_hours(proposed_shift)

        if total_hours > self.max_hours_per_day:
            violations.append(ComplianceViolation(
                type=ViolationType.DAILY_HOURS_EXCEEDED,
                severity=SeverityLevel.ERROR,
                message=f"Daily hours ({total_hours:.1f}) exceed maximum ({self.max_hours_per_day})",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                date=target_date,
                details={
                    "total_hours": round(total_hours, 2),
                    "max_hours": self.max_hours_per_day,
                    "excess_hours": round(total_hours - self.max_hours_per_day, 2)
                }
            ))

        return violations

    def validate_consecutive_days(
        self,
        employee_id: int,
        week_start: date,
        proposed_shifts: Optional[List[Shift]] = None
    ) -> List[ComplianceViolation]:
        """
        Validate 6-on-1-off pattern (must have at least 1 day off per week).
        """
        violations = []
        week_end = week_start + timedelta(days=6)

        # Get all shifts for the week
        existing_shifts = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee_id,
            Shift.date >= week_start,
            Shift.date <= week_end
        ).all()

        # Get unique work dates
        work_dates = set(s.date for s in existing_shifts)

        if proposed_shifts:
            for shift in proposed_shifts:
                if week_start <= shift.date <= week_end:
                    work_dates.add(shift.date)

        days_worked = len(work_dates)

        if days_worked > self.max_consecutive_days:
            violations.append(ComplianceViolation(
                type=ViolationType.CONSECUTIVE_DAYS_EXCEEDED,
                severity=SeverityLevel.ERROR,
                message=f"Scheduled {days_worked} days in a row (maximum is {self.max_consecutive_days})",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                details={
                    "days_scheduled": days_worked,
                    "max_consecutive_days": self.max_consecutive_days,
                    "work_dates": [d.isoformat() for d in sorted(work_dates)],
                    "week_start": week_start.isoformat()
                }
            ))

        return violations

    def validate_break_requirements(
        self,
        shift: Shift
    ) -> List[ComplianceViolation]:
        """
        Validate break requirements based on shift length.
        - 8 hour shift: 30 min break
        - 9 hour shift: 60 min break
        """
        violations = []
        total_hours = self._get_shift_total_hours(shift)

        required_break = 0
        if total_hours >= 9:
            required_break = self.break_minutes_9hr
        elif total_hours >= 8:
            required_break = self.break_minutes_8hr

        if shift.break_minutes < required_break:
            violations.append(ComplianceViolation(
                type=ViolationType.INSUFFICIENT_BREAK,
                severity=SeverityLevel.ERROR,
                message=f"Insufficient break time ({shift.break_minutes} min) for {total_hours:.1f} hour shift (requires {required_break} min)",
                employee_id=shift.employee_id,
                employee_name=self._get_employee_name(shift.employee_id),
                date=shift.date,
                details={
                    "shift_hours": round(total_hours, 2),
                    "break_minutes": shift.break_minutes,
                    "required_break_minutes": required_break
                }
            ))

        return violations

    def validate_time_off_conflicts(
        self,
        employee_id: int,
        target_date: date
    ) -> List[ComplianceViolation]:
        """Check if shift conflicts with approved time off."""
        violations = []

        # Check for approved time off on this date
        time_off = self.db.query(TimeOffRequest).filter(
            TimeOffRequest.employee_id == employee_id,
            TimeOffRequest.status == TimeOffStatus.APPROVED,
            TimeOffRequest.start_date <= target_date,
            TimeOffRequest.end_date >= target_date
        ).first()

        if time_off:
            violations.append(ComplianceViolation(
                type=ViolationType.TIME_OFF_CONFLICT,
                severity=SeverityLevel.ERROR,
                message=f"Shift conflicts with approved time off ({time_off.start_date} to {time_off.end_date})",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                date=target_date,
                details={
                    "time_off_start": time_off.start_date.isoformat(),
                    "time_off_end": time_off.end_date.isoformat(),
                    "time_off_id": time_off.id
                }
            ))

        return violations

    def validate_availability(
        self,
        employee_id: int,
        target_date: date,
        start_time: time,
        end_time: time
    ) -> List[ComplianceViolation]:
        """Check if shift conflicts with employee availability preferences."""
        violations = []
        day_of_week = target_date.weekday()

        availability = self.db.query(Availability).filter(
            Availability.employee_id == employee_id,
            Availability.day_of_week == day_of_week
        ).first()

        if availability and not availability.is_available:
            violations.append(ComplianceViolation(
                type=ViolationType.AVAILABILITY_CONFLICT,
                severity=SeverityLevel.WARNING,  # Warning, not error
                message=f"Employee marked as unavailable on {target_date.strftime('%A')}s",
                employee_id=employee_id,
                employee_name=self._get_employee_name(employee_id),
                date=target_date,
                details={
                    "day_of_week": day_of_week,
                    "day_name": target_date.strftime('%A')
                }
            ))

        return violations

    def validate_shift_overlap(
        self,
        employee_id: int,
        target_date: date,
        start_time: time,
        end_time: time,
        exclude_shift_id: Optional[int] = None
    ) -> List[ComplianceViolation]:
        """Check if shift overlaps with existing shifts."""
        violations = []

        # Get existing shifts for the day
        query = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee_id,
            Shift.date == target_date
        )

        if exclude_shift_id:
            query = query.filter(Shift.id != exclude_shift_id)

        existing_shifts = query.all()

        for existing in existing_shifts:
            # Check for overlap
            if not (end_time <= existing.start_time or start_time >= existing.end_time):
                violations.append(ComplianceViolation(
                    type=ViolationType.SHIFT_OVERLAP,
                    severity=SeverityLevel.ERROR,
                    message=f"Shift overlaps with existing shift ({existing.start_time}-{existing.end_time})",
                    employee_id=employee_id,
                    employee_name=self._get_employee_name(employee_id),
                    date=target_date,
                    details={
                        "proposed_start": start_time.isoformat(),
                        "proposed_end": end_time.isoformat(),
                        "existing_start": existing.start_time.isoformat(),
                        "existing_end": existing.end_time.isoformat(),
                        "existing_shift_id": existing.id
                    }
                ))

        return violations

    def validate_shift(
        self,
        shift: Shift,
        week_start: Optional[date] = None
    ) -> ComplianceResult:
        """
        Comprehensive validation of a single shift.

        Args:
            shift: Shift to validate
            week_start: Optional week start for context

        Returns:
            ComplianceResult with all violations, warnings, and info
        """
        all_violations = []

        if week_start is None:
            # Calculate week start (Monday) from shift date
            week_start = shift.date - timedelta(days=shift.date.weekday())

        # Run all validations
        all_violations.extend(self.validate_daily_hours(
            shift.employee_id, shift.date, shift
        ))
        all_violations.extend(self.validate_weekly_hours(
            shift.employee_id, week_start, [shift]
        ))
        all_violations.extend(self.validate_consecutive_days(
            shift.employee_id, week_start, [shift]
        ))
        all_violations.extend(self.validate_break_requirements(shift))
        all_violations.extend(self.validate_time_off_conflicts(
            shift.employee_id, shift.date
        ))
        all_violations.extend(self.validate_availability(
            shift.employee_id, shift.date, shift.start_time, shift.end_time
        ))
        all_violations.extend(self.validate_shift_overlap(
            shift.employee_id, shift.date, shift.start_time, shift.end_time,
            exclude_shift_id=shift.id if shift.id else None
        ))

        # Categorize by severity
        errors = [v for v in all_violations if v.severity == SeverityLevel.ERROR]
        warnings = [v for v in all_violations if v.severity == SeverityLevel.WARNING]
        info = [v for v in all_violations if v.severity == SeverityLevel.INFO]

        return ComplianceResult(
            is_compliant=len(errors) == 0,
            violations=errors,
            warnings=warnings,
            info=info
        )

    def validate_schedule(
        self,
        schedule_id: int
    ) -> ComplianceResult:
        """
        Validate an entire schedule for compliance.

        Args:
            schedule_id: Schedule ID to validate

        Returns:
            ComplianceResult with all violations across all shifts
        """
        schedule = self.db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            return ComplianceResult(
                is_compliant=False,
                violations=[ComplianceViolation(
                    type=ViolationType.WEEKLY_HOURS_EXCEEDED,
                    severity=SeverityLevel.ERROR,
                    message="Schedule not found",
                    employee_id=0
                )],
                warnings=[],
                info=[]
            )

        week_start = schedule.week_start_date
        all_violations = []

        # Get all shifts in the schedule
        shifts = self.db.query(Shift).filter(Shift.schedule_id == schedule_id).all()

        # Group shifts by employee
        employee_shifts: Dict[int, List[Shift]] = {}
        for shift in shifts:
            if shift.employee_id not in employee_shifts:
                employee_shifts[shift.employee_id] = []
            employee_shifts[shift.employee_id].append(shift)

        # Validate each employee's shifts
        for employee_id, emp_shifts in employee_shifts.items():
            # Weekly hours
            all_violations.extend(self.validate_weekly_hours(
                employee_id, week_start
            ))

            # Consecutive days
            all_violations.extend(self.validate_consecutive_days(
                employee_id, week_start
            ))

            # Per-shift validations
            for shift in emp_shifts:
                all_violations.extend(self.validate_daily_hours(
                    employee_id, shift.date
                ))
                all_violations.extend(self.validate_break_requirements(shift))
                all_violations.extend(self.validate_time_off_conflicts(
                    employee_id, shift.date
                ))
                all_violations.extend(self.validate_availability(
                    employee_id, shift.date, shift.start_time, shift.end_time
                ))

        # Deduplicate violations (same type/employee/date)
        seen = set()
        unique_violations = []
        for v in all_violations:
            key = (v.type, v.employee_id, v.date)
            if key not in seen:
                seen.add(key)
                unique_violations.append(v)

        # Categorize
        errors = [v for v in unique_violations if v.severity == SeverityLevel.ERROR]
        warnings = [v for v in unique_violations if v.severity == SeverityLevel.WARNING]
        info = [v for v in unique_violations if v.severity == SeverityLevel.INFO]

        return ComplianceResult(
            is_compliant=len(errors) == 0,
            violations=errors,
            warnings=warnings,
            info=info
        )

    def get_employee_compliance_status(
        self,
        employee_id: int,
        week_start: date
    ) -> Dict:
        """
        Get compliance status summary for an employee for a week.
        """
        week_end = week_start + timedelta(days=6)

        # Get shifts for the week
        shifts = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee_id,
            Shift.date >= week_start,
            Shift.date <= week_end
        ).all()

        # Calculate metrics
        total_hours = sum(self._get_shift_duration_hours(s) for s in shifts)
        work_dates = set(s.date for s in shifts)
        days_worked = len(work_dates)

        return {
            "employee_id": employee_id,
            "employee_name": self._get_employee_name(employee_id),
            "week_start": week_start.isoformat(),
            "total_hours": round(total_hours, 2),
            "max_hours": self.max_hours_per_week,
            "hours_remaining": round(max(0, self.max_hours_per_week - total_hours), 2),
            "days_worked": days_worked,
            "max_days": self.max_consecutive_days,
            "days_remaining": max(0, self.max_consecutive_days - days_worked),
            "is_at_limit": total_hours >= self.max_hours_per_week or days_worked >= self.max_consecutive_days,
            "shifts": [
                {
                    "date": s.date.isoformat(),
                    "start": s.start_time.isoformat(),
                    "end": s.end_time.isoformat(),
                    "hours": round(self._get_shift_duration_hours(s), 2)
                }
                for s in sorted(shifts, key=lambda x: x.date)
            ]
        }


def get_required_break_minutes(shift_hours: float) -> int:
    """Utility function to determine required break minutes."""
    if shift_hours >= 9:
        return settings.break_minutes_9hr_shift
    elif shift_hours >= 8:
        return settings.break_minutes_8hr_shift
    return 0
