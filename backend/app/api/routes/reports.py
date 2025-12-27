from typing import Dict, Any, List, Optional
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.shift import Shift, ShiftStatus
from app.models.schedule import Schedule, ScheduleStatus
from app.models.employee import Employee
from app.models.order_forecast import OrderForecast
from app.models.store import Store
from app.api.deps import require_manager_or_admin
from app.services.compliance import ComplianceEngine
from app.services.labor_standards import LaborStandardsService

router = APIRouter()

# Default hourly rate for labor cost calculations (can be overridden per store)
DEFAULT_HOURLY_RATE = 15.00


@router.get("/labor-summary", dependencies=[Depends(require_manager_or_admin)])
async def get_labor_summary(
    store_id: int = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get labor summary for a store and date range."""
    # Get all shifts in the date range
    shifts = db.query(Shift).join(Schedule).filter(
        Schedule.store_id == store_id,
        Shift.date >= start_date,
        Shift.date <= end_date
    ).all()

    # Calculate scheduled hours
    scheduled_hours = 0.0
    for shift in shifts:
        from datetime import datetime
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        hours = (end - start).total_seconds() / 3600 - shift.break_minutes / 60
        scheduled_hours += hours

    # Get forecasted orders
    forecasted_orders = db.query(
        func.sum(OrderForecast.predicted_orders)
    ).filter(
        OrderForecast.store_id == store_id,
        OrderForecast.date >= start_date,
        OrderForecast.date <= end_date
    ).scalar() or 0

    # Count employees
    employee_count = db.query(func.count(Employee.id)).filter(
        Employee.store_id == store_id
    ).scalar() or 0

    # Get labor standard for context
    labor_service = LaborStandardsService(db)
    standard = labor_service.get_labor_standard(store_id)

    return {
        "store_id": store_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "scheduled_hours": round(scheduled_hours, 2),
        "forecasted_orders": round(forecasted_orders, 2),
        "employee_count": employee_count,
        "orders_per_hour": round(forecasted_orders / scheduled_hours, 2) if scheduled_hours > 0 else 0,
        "target_orders_per_hour": standard.orders_per_picker_hour,
        "efficiency": round((forecasted_orders / scheduled_hours) / standard.orders_per_picker_hour * 100, 1) if scheduled_hours > 0 else 0
    }


@router.get("/coverage", dependencies=[Depends(require_manager_or_admin)])
async def get_coverage_report(
    store_id: int = Query(...),
    week_start: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get coverage report comparing scheduled hours to forecasted demand.

    Identifies understaffed and overstaffed periods.
    """
    labor_service = LaborStandardsService(db)
    store = db.query(Store).filter(Store.id == store_id).first()

    if not store:
        return {"error": "Store not found"}

    week_end = week_start + timedelta(days=6)

    # Get all shifts for the week
    shifts = db.query(Shift).join(Schedule).filter(
        Schedule.store_id == store_id,
        Shift.date >= week_start,
        Shift.date <= week_end
    ).all()

    # Build hourly coverage map
    coverage_by_hour = {}
    for day_offset in range(7):
        current_date = week_start + timedelta(days=day_offset)
        coverage_by_hour[current_date.isoformat()] = {}

        # Get requirements
        requirements = labor_service.get_hourly_requirements(store_id, current_date)

        # Get scheduled hours per hour
        day_shifts = [s for s in shifts if s.date == current_date]

        for hour in range(store.operating_start.hour, store.operating_end.hour):
            required = requirements.get(hour, 0)

            # Count scheduled picker-hours for this hour
            scheduled = 0.0
            for shift in day_shifts:
                shift_start_hour = shift.start_time.hour
                shift_end_hour = shift.end_time.hour
                if shift_start_hour <= hour < shift_end_hour:
                    scheduled += 1.0  # 1 picker for 1 hour

            coverage_by_hour[current_date.isoformat()][str(hour)] = {
                "required": round(required, 2),
                "scheduled": round(scheduled, 2),
                "delta": round(scheduled - required, 2),
                "status": "adequate" if abs(scheduled - required) < 0.5 else ("understaffed" if scheduled < required else "overstaffed")
            }

    # Calculate summary metrics
    understaffed = []
    overstaffed = []
    total_required = 0.0
    total_scheduled = 0.0

    for date_str, hours in coverage_by_hour.items():
        for hour, data in hours.items():
            total_required += data["required"]
            total_scheduled += data["scheduled"]
            if data["status"] == "understaffed":
                understaffed.append({"date": date_str, "hour": int(hour), "gap": abs(data["delta"])})
            elif data["status"] == "overstaffed":
                overstaffed.append({"date": date_str, "hour": int(hour), "excess": data["delta"]})

    coverage_score = round(min(total_scheduled / total_required * 100, 100), 1) if total_required > 0 else 100

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "coverage_score": coverage_score,
        "total_required_hours": round(total_required, 2),
        "total_scheduled_hours": round(total_scheduled, 2),
        "understaffed_periods": len(understaffed),
        "overstaffed_periods": len(overstaffed),
        "understaffed_hours": sorted(understaffed, key=lambda x: x["gap"], reverse=True)[:10],
        "overstaffed_hours": sorted(overstaffed, key=lambda x: x["excess"], reverse=True)[:10],
        "hourly_breakdown": coverage_by_hour
    }


@router.get("/compliance", dependencies=[Depends(require_manager_or_admin)])
async def get_compliance_report(
    store_id: int = Query(None),
    week_start: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get compliance report for a week.

    Checks all employees (or all at a store) for:
    - 44hr/week violations
    - 8hr/day violations
    - 6-on-1-off violations
    """
    engine = ComplianceEngine(db)

    # Get employees to check
    if store_id:
        employees = db.query(Employee).filter(Employee.store_id == store_id).all()
    else:
        employees = db.query(Employee).all()

    all_violations = []
    all_warnings = []
    employee_summaries = []

    for emp in employees:
        status = engine.get_employee_compliance_status(emp.id, week_start)
        employee_summaries.append(status)

        # Run full validation
        violations = engine.validate_weekly_hours(emp.id, week_start)
        violations.extend(engine.validate_consecutive_days(emp.id, week_start))

        for v in violations:
            if v.severity.value == "error":
                all_violations.append(v.to_dict())
            else:
                all_warnings.append(v.to_dict())

    return {
        "week_start": week_start.isoformat(),
        "store_id": store_id,
        "employees_checked": len(employees),
        "compliant": len(all_violations) == 0,
        "violation_count": len(all_violations),
        "warning_count": len(all_warnings),
        "violations": all_violations,
        "warnings": all_warnings,
        "employee_summaries": employee_summaries
    }


@router.get("/utilization", dependencies=[Depends(require_manager_or_admin)])
async def get_utilization_report(
    store_id: int = Query(...),
    week_start: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get employee utilization report for a week.

    Shows hours scheduled vs. maximum allowed for each employee.
    """
    engine = ComplianceEngine(db)
    week_end = week_start + timedelta(days=6)

    employees = db.query(Employee).filter(Employee.store_id == store_id).all()

    employee_utilization = []
    total_scheduled = 0.0
    total_capacity = 0.0

    for emp in employees:
        status = engine.get_employee_compliance_status(emp.id, week_start)
        utilization_pct = round(status["total_hours"] / status["max_hours"] * 100, 1)

        employee_utilization.append({
            "employee_id": emp.id,
            "employee_name": status["employee_name"],
            "hours_scheduled": status["total_hours"],
            "hours_max": status["max_hours"],
            "hours_remaining": status["hours_remaining"],
            "days_worked": status["days_worked"],
            "utilization_percent": utilization_pct
        })

        total_scheduled += status["total_hours"]
        total_capacity += status["max_hours"]

    # Sort by utilization
    employee_utilization.sort(key=lambda x: x["utilization_percent"], reverse=True)

    return {
        "store_id": store_id,
        "week_start": week_start.isoformat(),
        "total_employees": len(employees),
        "total_scheduled_hours": round(total_scheduled, 2),
        "total_capacity_hours": round(total_capacity, 2),
        "overall_utilization": round(total_scheduled / total_capacity * 100, 1) if total_capacity > 0 else 0,
        "employees": employee_utilization
    }


@router.get("/labor-cost", dependencies=[Depends(require_manager_or_admin)])
async def get_labor_cost_report(
    store_id: int = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    hourly_rate: float = Query(DEFAULT_HOURLY_RATE),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get detailed labor cost breakdown for a store and date range.

    Includes:
    - Total labor cost
    - Cost per day
    - Cost per employee
    - Cost per order (efficiency metric)
    - Overtime analysis
    """
    # Get all shifts in the date range
    shifts = db.query(Shift).join(Schedule).filter(
        Schedule.store_id == store_id,
        Shift.date >= start_date,
        Shift.date <= end_date,
        Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
    ).all()

    # Get employees for the store
    employees = db.query(Employee).filter(Employee.store_id == store_id).all()
    employee_map = {e.id: e for e in employees}

    # Get forecasted orders for efficiency calculation
    total_forecasted_orders = db.query(
        func.sum(OrderForecast.predicted_orders)
    ).filter(
        OrderForecast.store_id == store_id,
        OrderForecast.date >= start_date,
        OrderForecast.date <= end_date
    ).scalar() or 0

    # Calculate metrics
    daily_breakdown = {}
    employee_breakdown = {}
    total_regular_hours = 0.0
    total_overtime_hours = 0.0

    # Track weekly hours per employee for overtime calculation
    employee_weekly_hours = {}

    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.isoformat()
        daily_breakdown[date_str] = {
            "hours": 0.0,
            "cost": 0.0,
            "shifts": 0,
            "employees": set()
        }
        current_date += timedelta(days=1)

    for shift in shifts:
        # Calculate shift hours
        shift_start = datetime.combine(shift.date, shift.start_time)
        shift_end = datetime.combine(shift.date, shift.end_time)
        gross_hours = (shift_end - shift_start).total_seconds() / 3600
        net_hours = gross_hours - (shift.break_minutes / 60)

        date_str = shift.date.isoformat()
        emp_id = shift.employee_id

        # Update daily breakdown
        if date_str in daily_breakdown:
            daily_breakdown[date_str]["hours"] += net_hours
            daily_breakdown[date_str]["cost"] += net_hours * hourly_rate
            daily_breakdown[date_str]["shifts"] += 1
            daily_breakdown[date_str]["employees"].add(emp_id)

        # Update employee breakdown
        emp = employee_map.get(emp_id)
        emp_name = f"{emp.first_name} {emp.last_name}" if emp else f"Employee {emp_id}"

        if emp_id not in employee_breakdown:
            employee_breakdown[emp_id] = {
                "employee_id": emp_id,
                "employee_name": emp_name,
                "total_hours": 0.0,
                "regular_hours": 0.0,
                "overtime_hours": 0.0,
                "total_cost": 0.0,
                "shifts": 0
            }

        employee_breakdown[emp_id]["total_hours"] += net_hours
        employee_breakdown[emp_id]["shifts"] += 1

        # Track weekly hours for overtime calculation
        week_key = f"{emp_id}_{shift.date.isocalendar()[1]}"
        if week_key not in employee_weekly_hours:
            employee_weekly_hours[week_key] = 0
        employee_weekly_hours[week_key] += net_hours

        total_regular_hours += net_hours

    # Calculate overtime (hours over 44 per week per employee)
    for week_key, hours in employee_weekly_hours.items():
        emp_id = int(week_key.split("_")[0])
        if hours > 44:
            overtime = hours - 44
            total_overtime_hours += overtime
            if emp_id in employee_breakdown:
                employee_breakdown[emp_id]["overtime_hours"] += overtime
                employee_breakdown[emp_id]["regular_hours"] = employee_breakdown[emp_id]["total_hours"] - employee_breakdown[emp_id]["overtime_hours"]
        else:
            if emp_id in employee_breakdown:
                employee_breakdown[emp_id]["regular_hours"] = employee_breakdown[emp_id]["total_hours"]

    # Calculate costs (1.5x for overtime)
    total_regular_cost = (total_regular_hours - total_overtime_hours) * hourly_rate
    total_overtime_cost = total_overtime_hours * hourly_rate * 1.5
    total_cost = total_regular_cost + total_overtime_cost

    for emp_id, data in employee_breakdown.items():
        regular = data["regular_hours"]
        overtime = data["overtime_hours"]
        data["total_cost"] = (regular * hourly_rate) + (overtime * hourly_rate * 1.5)

    # Convert sets to counts in daily breakdown
    for date_str in daily_breakdown:
        daily_breakdown[date_str]["unique_employees"] = len(daily_breakdown[date_str]["employees"])
        del daily_breakdown[date_str]["employees"]

    # Calculate efficiency metrics
    cost_per_order = total_cost / total_forecasted_orders if total_forecasted_orders > 0 else 0
    orders_per_labor_dollar = total_forecasted_orders / total_cost if total_cost > 0 else 0

    return {
        "store_id": store_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly_rate": hourly_rate,
        "summary": {
            "total_hours": round(total_regular_hours, 2),
            "regular_hours": round(total_regular_hours - total_overtime_hours, 2),
            "overtime_hours": round(total_overtime_hours, 2),
            "total_cost": round(total_cost, 2),
            "regular_cost": round(total_regular_cost, 2),
            "overtime_cost": round(total_overtime_cost, 2),
            "total_shifts": len(shifts),
            "unique_employees": len(employee_breakdown),
            "forecasted_orders": round(total_forecasted_orders, 0),
            "cost_per_order": round(cost_per_order, 2),
            "orders_per_labor_dollar": round(orders_per_labor_dollar, 2)
        },
        "daily_breakdown": daily_breakdown,
        "employee_breakdown": sorted(
            list(employee_breakdown.values()),
            key=lambda x: x["total_cost"],
            reverse=True
        )
    }


@router.get("/efficiency", dependencies=[Depends(require_manager_or_admin)])
async def get_efficiency_report(
    store_id: int = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get efficiency metrics comparing actual productivity vs target.

    Includes:
    - Orders per picker-hour (actual vs target)
    - Efficiency score
    - Daily efficiency trend
    - Peak vs off-peak efficiency
    """
    labor_service = LaborStandardsService(db)
    standard = labor_service.get_labor_standard(store_id)
    target_oph = standard.orders_per_picker_hour

    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        return {"error": "Store not found"}

    # Get all shifts in the date range
    shifts = db.query(Shift).join(Schedule).filter(
        Schedule.store_id == store_id,
        Shift.date >= start_date,
        Shift.date <= end_date,
        Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
    ).all()

    # Get forecasted orders
    forecasts = db.query(OrderForecast).filter(
        OrderForecast.store_id == store_id,
        OrderForecast.date >= start_date,
        OrderForecast.date <= end_date
    ).all()

    # Build forecast lookup
    forecast_by_date_hour = {}
    for f in forecasts:
        key = f"{f.date.isoformat()}_{f.hour}"
        forecast_by_date_hour[key] = f.predicted_orders

    # Calculate daily efficiency
    daily_efficiency = {}
    hourly_efficiency = {h: {"hours": 0, "orders": 0} for h in range(24)}

    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.isoformat()
        daily_efficiency[date_str] = {
            "scheduled_hours": 0.0,
            "forecasted_orders": 0.0,
            "actual_oph": 0.0,
            "target_oph": target_oph,
            "efficiency_score": 0.0
        }

        # Get orders for this day
        day_orders = sum(
            forecast_by_date_hour.get(f"{date_str}_{h}", 0)
            for h in range(24)
        )
        daily_efficiency[date_str]["forecasted_orders"] = day_orders

        current_date += timedelta(days=1)

    # Calculate scheduled hours per day and hour
    for shift in shifts:
        date_str = shift.date.isoformat()
        shift_start = datetime.combine(shift.date, shift.start_time)
        shift_end = datetime.combine(shift.date, shift.end_time)
        gross_hours = (shift_end - shift_start).total_seconds() / 3600
        net_hours = gross_hours - (shift.break_minutes / 60)

        if date_str in daily_efficiency:
            daily_efficiency[date_str]["scheduled_hours"] += net_hours

        # Track hourly coverage
        for hour in range(shift.start_time.hour, shift.end_time.hour):
            hourly_efficiency[hour]["hours"] += 1  # 1 picker-hour per hour worked
            hourly_efficiency[hour]["orders"] += forecast_by_date_hour.get(
                f"{date_str}_{hour}", 0
            )

    # Calculate efficiency scores
    total_hours = 0.0
    total_orders = 0.0

    for date_str, data in daily_efficiency.items():
        if data["scheduled_hours"] > 0:
            data["actual_oph"] = round(data["forecasted_orders"] / data["scheduled_hours"], 2)
            data["efficiency_score"] = round(
                (data["actual_oph"] / target_oph) * 100, 1
            ) if target_oph > 0 else 0

        total_hours += data["scheduled_hours"]
        total_orders += data["forecasted_orders"]

    # Calculate hourly efficiency
    peak_hours = []
    off_peak_hours = []

    for hour, data in hourly_efficiency.items():
        if data["hours"] > 0:
            oph = data["orders"] / data["hours"]
            efficiency = (oph / target_oph) * 100 if target_oph > 0 else 0

            hour_data = {
                "hour": hour,
                "orders_per_hour": round(oph, 2),
                "efficiency": round(efficiency, 1)
            }

            if oph >= target_oph:
                peak_hours.append(hour_data)
            else:
                off_peak_hours.append(hour_data)

    # Overall metrics
    overall_oph = total_orders / total_hours if total_hours > 0 else 0
    overall_efficiency = (overall_oph / target_oph) * 100 if target_oph > 0 else 0

    return {
        "store_id": store_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "summary": {
            "total_scheduled_hours": round(total_hours, 2),
            "total_forecasted_orders": round(total_orders, 0),
            "actual_orders_per_hour": round(overall_oph, 2),
            "target_orders_per_hour": target_oph,
            "efficiency_score": round(overall_efficiency, 1),
            "efficiency_status": "excellent" if overall_efficiency >= 100 else "good" if overall_efficiency >= 80 else "needs_improvement"
        },
        "daily_breakdown": daily_efficiency,
        "peak_hours": sorted(peak_hours, key=lambda x: x["efficiency"], reverse=True),
        "off_peak_hours": sorted(off_peak_hours, key=lambda x: x["efficiency"])
    }


@router.get("/trends", dependencies=[Depends(require_manager_or_admin)])
async def get_trend_report(
    store_id: int = Query(...),
    weeks: int = Query(4, ge=1, le=12),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get multi-week trends for labor cost and efficiency.

    Provides week-over-week comparison for:
    - Labor hours
    - Labor cost
    - Efficiency score
    - Coverage score
    """
    labor_service = LaborStandardsService(db)
    standard = labor_service.get_labor_standard(store_id)

    # Calculate start date (Monday of X weeks ago)
    today = date.today()
    current_monday = today - timedelta(days=today.weekday())
    start_monday = current_monday - timedelta(weeks=weeks-1)

    weekly_data = []

    for week_offset in range(weeks):
        week_start = start_monday + timedelta(weeks=week_offset)
        week_end = week_start + timedelta(days=6)

        # Get shifts for this week
        shifts = db.query(Shift).join(Schedule).filter(
            Schedule.store_id == store_id,
            Shift.date >= week_start,
            Shift.date <= week_end,
            Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
        ).all()

        # Calculate hours
        total_hours = 0.0
        for shift in shifts:
            shift_start = datetime.combine(shift.date, shift.start_time)
            shift_end = datetime.combine(shift.date, shift.end_time)
            gross_hours = (shift_end - shift_start).total_seconds() / 3600
            net_hours = gross_hours - (shift.break_minutes / 60)
            total_hours += net_hours

        # Get forecasted orders
        forecasted_orders = db.query(
            func.sum(OrderForecast.predicted_orders)
        ).filter(
            OrderForecast.store_id == store_id,
            OrderForecast.date >= week_start,
            OrderForecast.date <= week_end
        ).scalar() or 0

        # Calculate required hours
        required_hours = 0.0
        for day_offset in range(7):
            target_date = week_start + timedelta(days=day_offset)
            daily_req = labor_service.get_daily_requirement(store_id, target_date)
            required_hours += daily_req

        # Calculate metrics
        labor_cost = total_hours * DEFAULT_HOURLY_RATE
        actual_oph = forecasted_orders / total_hours if total_hours > 0 else 0
        efficiency = (actual_oph / standard.orders_per_picker_hour) * 100 if standard.orders_per_picker_hour > 0 else 0
        coverage = (total_hours / required_hours) * 100 if required_hours > 0 else 100

        weekly_data.append({
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "week_label": f"W{week_start.isocalendar()[1]}",
            "scheduled_hours": round(total_hours, 2),
            "required_hours": round(required_hours, 2),
            "labor_cost": round(labor_cost, 2),
            "forecasted_orders": round(forecasted_orders, 0),
            "orders_per_hour": round(actual_oph, 2),
            "efficiency_score": round(efficiency, 1),
            "coverage_score": round(min(coverage, 100), 1)
        })

    # Calculate trends (week-over-week changes)
    if len(weekly_data) >= 2:
        for i in range(1, len(weekly_data)):
            prev = weekly_data[i-1]
            curr = weekly_data[i]

            curr["hours_change"] = round(curr["scheduled_hours"] - prev["scheduled_hours"], 2)
            curr["cost_change"] = round(curr["labor_cost"] - prev["labor_cost"], 2)
            curr["efficiency_change"] = round(curr["efficiency_score"] - prev["efficiency_score"], 1)
            curr["coverage_change"] = round(curr["coverage_score"] - prev["coverage_score"], 1)

        # First week has no previous to compare
        weekly_data[0]["hours_change"] = 0
        weekly_data[0]["cost_change"] = 0
        weekly_data[0]["efficiency_change"] = 0
        weekly_data[0]["coverage_change"] = 0

    # Calculate averages
    avg_hours = sum(w["scheduled_hours"] for w in weekly_data) / len(weekly_data) if weekly_data else 0
    avg_cost = sum(w["labor_cost"] for w in weekly_data) / len(weekly_data) if weekly_data else 0
    avg_efficiency = sum(w["efficiency_score"] for w in weekly_data) / len(weekly_data) if weekly_data else 0
    avg_coverage = sum(w["coverage_score"] for w in weekly_data) / len(weekly_data) if weekly_data else 0

    return {
        "store_id": store_id,
        "weeks_analyzed": weeks,
        "averages": {
            "avg_weekly_hours": round(avg_hours, 2),
            "avg_weekly_cost": round(avg_cost, 2),
            "avg_efficiency": round(avg_efficiency, 1),
            "avg_coverage": round(avg_coverage, 1)
        },
        "weekly_data": weekly_data
    }


@router.get("/store-comparison", dependencies=[Depends(require_manager_or_admin)])
async def get_store_comparison(
    week_start: date = Query(...),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Compare labor cost and efficiency across all stores for a given week.
    """
    stores = db.query(Store).all()
    week_end = week_start + timedelta(days=6)

    store_metrics = []

    for store in stores:
        labor_service = LaborStandardsService(db)
        standard = labor_service.get_labor_standard(store.id)

        # Get shifts for this week
        shifts = db.query(Shift).join(Schedule).filter(
            Schedule.store_id == store.id,
            Shift.date >= week_start,
            Shift.date <= week_end,
            Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
        ).all()

        # Calculate hours
        total_hours = 0.0
        for shift in shifts:
            shift_start = datetime.combine(shift.date, shift.start_time)
            shift_end = datetime.combine(shift.date, shift.end_time)
            gross_hours = (shift_end - shift_start).total_seconds() / 3600
            net_hours = gross_hours - (shift.break_minutes / 60)
            total_hours += net_hours

        # Get forecasted orders
        forecasted_orders = db.query(
            func.sum(OrderForecast.predicted_orders)
        ).filter(
            OrderForecast.store_id == store.id,
            OrderForecast.date >= week_start,
            OrderForecast.date <= week_end
        ).scalar() or 0

        # Calculate required hours
        required_hours = 0.0
        for day_offset in range(7):
            target_date = week_start + timedelta(days=day_offset)
            daily_req = labor_service.get_daily_requirement(store.id, target_date)
            required_hours += daily_req

        # Calculate metrics
        labor_cost = total_hours * DEFAULT_HOURLY_RATE
        actual_oph = forecasted_orders / total_hours if total_hours > 0 else 0
        efficiency = (actual_oph / standard.orders_per_picker_hour) * 100 if standard.orders_per_picker_hour > 0 else 0
        coverage = (total_hours / required_hours) * 100 if required_hours > 0 else 100
        cost_per_order = labor_cost / forecasted_orders if forecasted_orders > 0 else 0

        # Count employees
        employee_count = db.query(func.count(Employee.id)).filter(
            Employee.store_id == store.id
        ).scalar() or 0

        store_metrics.append({
            "store_id": store.id,
            "store_name": store.name,
            "store_code": store.code,
            "employee_count": employee_count,
            "scheduled_hours": round(total_hours, 2),
            "required_hours": round(required_hours, 2),
            "labor_cost": round(labor_cost, 2),
            "forecasted_orders": round(forecasted_orders, 0),
            "orders_per_hour": round(actual_oph, 2),
            "efficiency_score": round(efficiency, 1),
            "coverage_score": round(min(coverage, 100), 1),
            "cost_per_order": round(cost_per_order, 2)
        })

    # Sort by efficiency
    store_metrics.sort(key=lambda x: x["efficiency_score"], reverse=True)

    # Calculate totals
    total_hours = sum(s["scheduled_hours"] for s in store_metrics)
    total_cost = sum(s["labor_cost"] for s in store_metrics)
    total_orders = sum(s["forecasted_orders"] for s in store_metrics)

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "totals": {
            "total_stores": len(stores),
            "total_hours": round(total_hours, 2),
            "total_cost": round(total_cost, 2),
            "total_orders": round(total_orders, 0),
            "avg_efficiency": round(sum(s["efficiency_score"] for s in store_metrics) / len(store_metrics), 1) if store_metrics else 0,
            "avg_coverage": round(sum(s["coverage_score"] for s in store_metrics) / len(store_metrics), 1) if store_metrics else 0
        },
        "stores": store_metrics
    }
