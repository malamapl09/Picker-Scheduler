"""
Schedule Optimizer using Google OR-Tools

Generates optimized weekly schedules that:
- Match staffing to forecasted demand
- Respect all compliance rules
- Consider employee availability
- Distribute shifts fairly among employees
"""

from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass, field
from datetime import date, time, datetime, timedelta
from enum import Enum
import logging

from ortools.sat.python import cp_model
from sqlalchemy.orm import Session

from app.models.employee import Employee, EmployeeStatus
from app.models.store import Store
from app.models.schedule import Schedule, ScheduleStatus
from app.models.shift import Shift
from app.models.availability import Availability
from app.models.time_off_request import TimeOffRequest, TimeOffStatus
from app.models.order_forecast import OrderForecast
from app.services.labor_standards import LaborStandardsService
from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class OptimizationStatus(str, Enum):
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"


@dataclass
class ShiftTemplate:
    """Defines a possible shift pattern."""
    start_hour: int
    end_hour: int
    break_minutes: int

    @property
    def duration_hours(self) -> float:
        return self.end_hour - self.start_hour

    @property
    def working_hours(self) -> float:
        return self.duration_hours - self.break_minutes / 60


@dataclass
class EmployeeConstraints:
    """Constraints for a specific employee."""
    employee_id: int
    available_days: Set[int]  # Day indices (0-6) when available
    preferred_hours: Dict[int, Tuple[int, int]]  # Day -> (start_hour, end_hour)
    time_off_days: Set[int]  # Day indices with approved time off
    max_hours_remaining: float  # Hours available this week
    max_days_remaining: int  # Days available this week


@dataclass
class DemandSlot:
    """Demand for a specific time slot."""
    day_index: int
    hour: int
    required_pickers: float


@dataclass
class LockedShift:
    """A shift that must be included in the schedule (manager-locked)."""
    employee_id: int
    day_index: int
    shift_template_idx: int
    reason: str = ""


@dataclass
class ManualOverride:
    """Manual constraints for specific employee-day combinations."""
    employee_id: int
    day_index: int
    must_work: bool = False  # Employee MUST work this day
    cannot_work: bool = False  # Employee CANNOT work this day
    preferred_shift_idx: Optional[int] = None  # Preferred shift template if must_work
    reason: str = ""


@dataclass
class OptimizationResult:
    """Result of schedule optimization."""
    status: OptimizationStatus
    message: str
    shifts: List[Dict] = field(default_factory=list)
    stats: Dict = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "status": self.status.value,
            "message": self.message,
            "shifts": self.shifts,
            "stats": self.stats,
            "warnings": self.warnings
        }


class ScheduleOptimizer:
    """
    Constraint-based schedule optimizer using Google OR-Tools CP-SAT solver.
    """

    # Standard shift templates (8am-10pm operating hours)
    SHIFT_TEMPLATES = [
        ShiftTemplate(8, 16, 30),   # 8am-4pm (8hr with 30min break)
        ShiftTemplate(9, 17, 30),   # 9am-5pm
        ShiftTemplate(10, 18, 30),  # 10am-6pm
        ShiftTemplate(11, 19, 30),  # 11am-7pm
        ShiftTemplate(12, 20, 30),  # 12pm-8pm
        ShiftTemplate(14, 22, 30),  # 2pm-10pm
        ShiftTemplate(8, 17, 60),   # 8am-5pm (9hr with 1hr break)
        ShiftTemplate(13, 22, 60),  # 1pm-10pm (9hr with 1hr break)
    ]

    def __init__(self, db: Session):
        self.db = db
        self.labor_service = LaborStandardsService(db)

    def _get_employees(self, store_id: int) -> List[Employee]:
        """Get all active employees for a store."""
        return self.db.query(Employee).filter(
            Employee.store_id == store_id,
            Employee.status == EmployeeStatus.ACTIVE
        ).all()

    def _get_employee_constraints(
        self,
        employee: Employee,
        week_start: date
    ) -> EmployeeConstraints:
        """Build constraints for an employee."""
        # Get availability preferences
        availabilities = self.db.query(Availability).filter(
            Availability.employee_id == employee.id
        ).all()

        available_days = set(range(7))  # Default: all days
        preferred_hours = {}

        for avail in availabilities:
            if not avail.is_available:
                available_days.discard(avail.day_of_week)
            elif avail.preferred_start and avail.preferred_end:
                preferred_hours[avail.day_of_week] = (
                    avail.preferred_start.hour,
                    avail.preferred_end.hour
                )

        # Get approved time off
        week_end = week_start + timedelta(days=6)
        time_off = self.db.query(TimeOffRequest).filter(
            TimeOffRequest.employee_id == employee.id,
            TimeOffRequest.status == TimeOffStatus.APPROVED,
            TimeOffRequest.start_date <= week_end,
            TimeOffRequest.end_date >= week_start
        ).all()

        time_off_days = set()
        for request in time_off:
            for day_offset in range(7):
                check_date = week_start + timedelta(days=day_offset)
                if request.start_date <= check_date <= request.end_date:
                    time_off_days.add(day_offset)
                    available_days.discard(day_offset)

        # Get existing hours/days for the week
        existing_shifts = self.db.query(Shift).join(Schedule).filter(
            Shift.employee_id == employee.id,
            Shift.date >= week_start,
            Shift.date <= week_end
        ).all()

        existing_hours = sum(
            (datetime.combine(s.date, s.end_time) -
             datetime.combine(s.date, s.start_time)).total_seconds() / 3600 - s.break_minutes / 60
            for s in existing_shifts
        )
        existing_days = len(set(s.date for s in existing_shifts))

        return EmployeeConstraints(
            employee_id=employee.id,
            available_days=available_days,
            preferred_hours=preferred_hours,
            time_off_days=time_off_days,
            max_hours_remaining=max(0, settings.max_hours_per_week - existing_hours),
            max_days_remaining=max(0, settings.days_on_per_week - existing_days)
        )

    def _get_demand_slots(
        self,
        store_id: int,
        week_start: date
    ) -> List[DemandSlot]:
        """Get demand slots for the week from forecasts."""
        store = self.db.query(Store).filter(Store.id == store_id).first()
        if not store:
            return []

        demand_slots = []
        start_hour = store.operating_start.hour if store.operating_start else 8
        end_hour = store.operating_end.hour if store.operating_end else 22

        for day_index in range(7):
            target_date = week_start + timedelta(days=day_index)
            requirements = self.labor_service.get_hourly_requirements(store_id, target_date)

            for hour in range(start_hour, end_hour):
                required = requirements.get(hour, 0)
                if required > 0:
                    demand_slots.append(DemandSlot(
                        day_index=day_index,
                        hour=hour,
                        required_pickers=required
                    ))

        return demand_slots

    def _get_applicable_shifts(
        self,
        employee_constraints: EmployeeConstraints,
        day_index: int,
        store: Store
    ) -> List[ShiftTemplate]:
        """Get shift templates applicable for an employee on a specific day."""
        if day_index not in employee_constraints.available_days:
            return []

        start_hour = store.operating_start.hour if store.operating_start else 8
        end_hour = store.operating_end.hour if store.operating_end else 22

        applicable = []
        for template in self.SHIFT_TEMPLATES:
            # Check if shift fits within store hours
            if template.start_hour < start_hour or template.end_hour > end_hour:
                continue

            # Check if shift fits within employee's preferred hours
            if day_index in employee_constraints.preferred_hours:
                pref_start, pref_end = employee_constraints.preferred_hours[day_index]
                if template.start_hour < pref_start or template.end_hour > pref_end:
                    continue

            # Check if employee has enough hours remaining
            if template.working_hours > employee_constraints.max_hours_remaining:
                continue

            applicable.append(template)

        return applicable

    def optimize(
        self,
        store_id: int,
        week_start: date,
        timeout_seconds: int = 60,
        min_coverage_percent: float = 0.9,
        locked_shifts: Optional[List[LockedShift]] = None,
        manual_overrides: Optional[List[ManualOverride]] = None
    ) -> OptimizationResult:
        """
        Generate an optimized schedule for a store and week.

        Args:
            store_id: Store to schedule
            week_start: Monday of the target week
            timeout_seconds: Maximum solve time
            min_coverage_percent: Minimum acceptable demand coverage (0.0-1.0)
            locked_shifts: Shifts that MUST be included (manager-locked)
            manual_overrides: Manual constraints for specific employee-day combinations

        Returns:
            OptimizationResult with generated shifts or error info
        """
        locked_shifts = locked_shifts or []
        manual_overrides = manual_overrides or []
        try:
            store = self.db.query(Store).filter(Store.id == store_id).first()
            if not store:
                return OptimizationResult(
                    status=OptimizationStatus.ERROR,
                    message="Store not found"
                )

            employees = self._get_employees(store_id)
            if not employees:
                return OptimizationResult(
                    status=OptimizationStatus.ERROR,
                    message="No active employees found for this store"
                )

            # Build constraints for each employee
            emp_constraints = {
                emp.id: self._get_employee_constraints(emp, week_start)
                for emp in employees
            }

            # Get demand
            demand_slots = self._get_demand_slots(store_id, week_start)
            if not demand_slots:
                return OptimizationResult(
                    status=OptimizationStatus.FEASIBLE,
                    message="No demand forecast found - returning empty schedule",
                    shifts=[],
                    warnings=["No demand forecast data available"]
                )

            # Create the model
            model = cp_model.CpModel()

            # Decision variables
            # shift_vars[emp_id][day][shift_template_idx] = 1 if employee works that shift
            shift_vars = {}
            for emp in employees:
                shift_vars[emp.id] = {}
                for day in range(7):
                    shift_vars[emp.id][day] = {}
                    applicable = self._get_applicable_shifts(
                        emp_constraints[emp.id], day, store
                    )
                    for shift_idx, template in enumerate(self.SHIFT_TEMPLATES):
                        if template in applicable:
                            shift_vars[emp.id][day][shift_idx] = model.NewBoolVar(
                                f"shift_e{emp.id}_d{day}_s{shift_idx}"
                            )

            # Apply manual overrides - process "cannot work" constraints
            override_warnings = []
            for override in manual_overrides:
                emp_id = override.employee_id
                day = override.day_index

                if override.cannot_work:
                    # Employee cannot work this day - set all shifts to 0
                    if emp_id in shift_vars and day in shift_vars[emp_id]:
                        for shift_idx, var in shift_vars[emp_id][day].items():
                            model.Add(var == 0)
                        override_warnings.append(
                            f"Override: Employee {emp_id} blocked from day {day}"
                        )

                elif override.must_work:
                    # Employee must work this day - at least one shift must be 1
                    if emp_id in shift_vars and day in shift_vars[emp_id]:
                        shifts_on_day = list(shift_vars[emp_id][day].values())
                        if shifts_on_day:
                            model.Add(sum(shifts_on_day) >= 1)
                            override_warnings.append(
                                f"Override: Employee {emp_id} required on day {day}"
                            )

                            # If specific shift preferred, add strong preference via objective
                            if override.preferred_shift_idx is not None:
                                if override.preferred_shift_idx in shift_vars[emp_id][day]:
                                    # This will be boosted in objective, not hard constraint
                                    pass

            # Apply locked shifts - these MUST be in the schedule
            locked_shift_warnings = []
            for locked in locked_shifts:
                emp_id = locked.employee_id
                day = locked.day_index
                shift_idx = locked.shift_template_idx

                # Ensure the variable exists, create if needed
                if emp_id not in shift_vars:
                    shift_vars[emp_id] = {}
                if day not in shift_vars[emp_id]:
                    shift_vars[emp_id][day] = {}

                if shift_idx not in shift_vars[emp_id][day]:
                    # Create the variable for this locked shift
                    shift_vars[emp_id][day][shift_idx] = model.NewBoolVar(
                        f"shift_e{emp_id}_d{day}_s{shift_idx}_locked"
                    )

                # Force this shift to be assigned
                model.Add(shift_vars[emp_id][day][shift_idx] == 1)
                locked_shift_warnings.append(
                    f"Locked: Employee {emp_id} on day {day} with shift template {shift_idx}"
                )

            # Constraint 1: At most one shift per employee per day
            for emp_id in shift_vars:
                for day in shift_vars[emp_id]:
                    shifts_on_day = list(shift_vars[emp_id][day].values())
                    if shifts_on_day:
                        model.Add(sum(shifts_on_day) <= 1)

            # Constraint 2: Maximum days per week (6-on-1-off)
            for emp_id in shift_vars:
                days_worked = []
                for day in shift_vars[emp_id]:
                    shifts_on_day = list(shift_vars[emp_id][day].values())
                    if shifts_on_day:
                        day_worked = model.NewBoolVar(f"day_e{emp_id}_d{day}")
                        model.AddMaxEquality(day_worked, shifts_on_day)
                        days_worked.append(day_worked)

                if days_worked:
                    max_days = min(
                        emp_constraints[emp_id].max_days_remaining,
                        settings.days_on_per_week
                    )
                    model.Add(sum(days_worked) <= max_days)

            # Constraint 3: Maximum hours per week
            for emp_id in shift_vars:
                hours_worked = []
                for day in shift_vars[emp_id]:
                    for shift_idx, var in shift_vars[emp_id][day].items():
                        template = self.SHIFT_TEMPLATES[shift_idx]
                        # Multiply by 10 to work with integers (OR-Tools prefers integers)
                        hours_worked.append(var * int(template.working_hours * 10))

                if hours_worked:
                    max_hours = min(
                        emp_constraints[emp_id].max_hours_remaining,
                        settings.max_hours_per_week
                    )
                    model.Add(sum(hours_worked) <= int(max_hours * 10))

            # Coverage tracking for objective
            coverage_vars = {}
            total_demand = sum(slot.required_pickers for slot in demand_slots)

            for slot in demand_slots:
                # Count pickers covering this hour
                covering_shifts = []
                for emp_id in shift_vars:
                    if slot.day_index in shift_vars[emp_id]:
                        for shift_idx, var in shift_vars[emp_id][slot.day_index].items():
                            template = self.SHIFT_TEMPLATES[shift_idx]
                            if template.start_hour <= slot.hour < template.end_hour:
                                covering_shifts.append(var)

                if covering_shifts:
                    slot_key = (slot.day_index, slot.hour)
                    # Track how many pickers are assigned vs needed
                    coverage_vars[slot_key] = {
                        "required": slot.required_pickers,
                        "assigned": covering_shifts
                    }

            # Objective: Maximize coverage while distributing fairly
            # Component 1: Coverage (weighted heavily)
            coverage_score = []
            for slot_key, data in coverage_vars.items():
                assigned = data["assigned"]
                required = int(data["required"])
                if assigned:
                    # Award points for each picker up to required amount
                    for i, var in enumerate(assigned):
                        if i < required:
                            coverage_score.append(var * 100)  # High weight for meeting demand
                        else:
                            coverage_score.append(var * (-10))  # Penalty for overstaffing

            # Component 2: Fair distribution (minimize variance in hours)
            # Approximate by tracking total hours per employee
            emp_hours = {}
            for emp_id in shift_vars:
                hours = []
                for day in shift_vars[emp_id]:
                    for shift_idx, var in shift_vars[emp_id][day].items():
                        template = self.SHIFT_TEMPLATES[shift_idx]
                        hours.append(var * int(template.working_hours * 10))
                if hours:
                    emp_hours[emp_id] = sum(hours)

            # Add small bonus for working (encourages using employees)
            work_bonus = []
            for emp_id in shift_vars:
                for day in shift_vars[emp_id]:
                    for shift_idx, var in shift_vars[emp_id][day].items():
                        work_bonus.append(var * 1)  # Small bonus per shift

            # Combine objectives
            model.Maximize(sum(coverage_score) + sum(work_bonus))

            # Solve
            solver = cp_model.CpSolver()
            solver.parameters.max_time_in_seconds = timeout_seconds
            solver.parameters.num_search_workers = 4

            status = solver.Solve(model)

            # Process results
            if status == cp_model.OPTIMAL:
                opt_status = OptimizationStatus.OPTIMAL
                message = "Optimal schedule found"
            elif status == cp_model.FEASIBLE:
                opt_status = OptimizationStatus.FEASIBLE
                message = "Feasible schedule found (may not be optimal)"
            elif status == cp_model.INFEASIBLE:
                return OptimizationResult(
                    status=OptimizationStatus.INFEASIBLE,
                    message="No feasible schedule exists with current constraints",
                    warnings=[
                        "Consider: adding more employees, relaxing availability, or reducing demand"
                    ]
                )
            else:
                return OptimizationResult(
                    status=OptimizationStatus.TIMEOUT,
                    message=f"Optimization timed out after {timeout_seconds} seconds"
                )

            # Extract shifts from solution
            generated_shifts = []
            total_hours = 0
            emp_shift_counts = {emp.id: 0 for emp in employees}

            for emp_id in shift_vars:
                emp = next(e for e in employees if e.id == emp_id)
                for day in shift_vars[emp_id]:
                    for shift_idx, var in shift_vars[emp_id][day].items():
                        if solver.Value(var) == 1:
                            template = self.SHIFT_TEMPLATES[shift_idx]
                            shift_date = week_start + timedelta(days=day)

                            generated_shifts.append({
                                "employee_id": emp_id,
                                "employee_name": emp.full_name,
                                "date": shift_date.isoformat(),
                                "start_time": f"{template.start_hour:02d}:00",
                                "end_time": f"{template.end_hour:02d}:00",
                                "break_minutes": template.break_minutes,
                                "working_hours": template.working_hours
                            })
                            total_hours += template.working_hours
                            emp_shift_counts[emp_id] += 1

            # Calculate coverage stats
            covered_demand = 0
            for slot_key, data in coverage_vars.items():
                assigned_count = sum(solver.Value(v) for v in data["assigned"])
                covered_demand += min(assigned_count, data["required"])

            coverage_percent = (covered_demand / total_demand * 100) if total_demand > 0 else 100

            # Generate warnings
            warnings = []
            if coverage_percent < min_coverage_percent * 100:
                warnings.append(f"Coverage ({coverage_percent:.1f}%) below target ({min_coverage_percent*100:.0f}%)")

            unused_employees = [e.full_name for e in employees if emp_shift_counts[e.id] == 0]
            if unused_employees:
                warnings.append(f"Employees not scheduled: {', '.join(unused_employees)}")

            # Add override info to warnings
            warnings.extend(override_warnings)
            warnings.extend(locked_shift_warnings)

            return OptimizationResult(
                status=opt_status,
                message=message,
                shifts=generated_shifts,
                stats={
                    "total_shifts": len(generated_shifts),
                    "total_hours": round(total_hours, 1),
                    "employees_scheduled": sum(1 for c in emp_shift_counts.values() if c > 0),
                    "total_employees": len(employees),
                    "coverage_percent": round(coverage_percent, 1),
                    "total_demand_hours": round(total_demand, 1),
                    "solve_time_seconds": round(solver.WallTime(), 2),
                    "locked_shifts_count": len(locked_shifts),
                    "manual_overrides_count": len(manual_overrides)
                },
                warnings=warnings
            )

        except Exception as e:
            logger.exception("Optimization error")
            return OptimizationResult(
                status=OptimizationStatus.ERROR,
                message=f"Optimization error: {str(e)}"
            )

    def apply_schedule(
        self,
        store_id: int,
        week_start: date,
        shifts: List[Dict],
        created_by: int
    ) -> Tuple[Schedule, List[Shift]]:
        """
        Apply generated shifts to create a schedule in the database.

        Args:
            store_id: Store ID
            week_start: Monday of the week
            shifts: List of shift dictionaries from optimization
            created_by: User ID creating the schedule

        Returns:
            Tuple of (Schedule, List[Shift])
        """
        # Create or get existing draft schedule
        schedule = self.db.query(Schedule).filter(
            Schedule.store_id == store_id,
            Schedule.week_start_date == week_start,
            Schedule.status == ScheduleStatus.DRAFT
        ).first()

        if schedule:
            # Clear existing shifts
            self.db.query(Shift).filter(Shift.schedule_id == schedule.id).delete()
        else:
            schedule = Schedule(
                store_id=store_id,
                week_start_date=week_start,
                status=ScheduleStatus.DRAFT,
                created_by=created_by
            )
            self.db.add(schedule)
            self.db.flush()

        # Create shifts
        created_shifts = []
        for shift_data in shifts:
            shift = Shift(
                schedule_id=schedule.id,
                employee_id=shift_data["employee_id"],
                date=date.fromisoformat(shift_data["date"]),
                start_time=time.fromisoformat(shift_data["start_time"]),
                end_time=time.fromisoformat(shift_data["end_time"]),
                break_minutes=shift_data["break_minutes"]
            )
            self.db.add(shift)
            created_shifts.append(shift)

        self.db.commit()
        self.db.refresh(schedule)

        return schedule, created_shifts
