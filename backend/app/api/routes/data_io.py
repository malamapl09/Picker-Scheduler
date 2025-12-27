"""
Data Import/Export API Routes

Provides endpoints for:
- Bulk employee import (CSV/Excel)
- Historical order data import (CSV/Excel)
- Schedule export (CSV/Excel/PDF)
- Report export (CSV/Excel)
"""

from typing import Optional, List
from datetime import date, datetime, time
from io import BytesIO, StringIO
import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.deps import require_admin, require_manager_or_admin, get_current_user
from app.models.user import User, UserRole
from app.models.employee import Employee, EmployeeStatus
from app.models.store import Store
from app.models.historical_order import HistoricalOrder
from app.models.schedule import Schedule
from app.models.shift import Shift, ShiftStatus
from app.models.availability import Availability

router = APIRouter()


# ============================================================================
# IMPORT ENDPOINTS
# ============================================================================

@router.post("/import/employees")
async def import_employees(
    file: UploadFile = File(...),
    store_id: Optional[int] = Query(None, description="Default store ID for employees without store specified"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Bulk import employees from CSV or Excel file.

    Required columns: first_name, last_name, email
    Optional columns: store_id, store_code, hire_date, status

    If store_id is not in file, uses the query parameter store_id as default.
    """
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Supported formats: CSV, XLSX, XLS"
        )

    try:
        # Read file content
        content = await file.read()

        # Parse based on file type
        if filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))

        # Validate required columns
        required_cols = ['first_name', 'last_name', 'email']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_cols)}"
            )

        # Get store mapping if store_code column exists
        store_map = {}
        if 'store_code' in df.columns:
            stores = db.query(Store).all()
            store_map = {s.code: s.id for s in stores}

        # Process rows
        created = 0
        skipped = 0
        errors = []

        for idx, row in df.iterrows():
            try:
                # Check if email already exists
                existing = db.query(User).filter(User.email == row['email']).first()
                if existing:
                    skipped += 1
                    errors.append(f"Row {idx + 2}: Email {row['email']} already exists")
                    continue

                # Determine store_id
                emp_store_id = None
                if 'store_id' in df.columns and pd.notna(row.get('store_id')):
                    emp_store_id = int(row['store_id'])
                elif 'store_code' in df.columns and pd.notna(row.get('store_code')):
                    emp_store_id = store_map.get(row['store_code'])
                    if not emp_store_id:
                        errors.append(f"Row {idx + 2}: Unknown store code {row['store_code']}")
                        skipped += 1
                        continue
                else:
                    emp_store_id = store_id

                if not emp_store_id:
                    errors.append(f"Row {idx + 2}: No store specified")
                    skipped += 1
                    continue

                # Verify store exists
                store = db.query(Store).filter(Store.id == emp_store_id).first()
                if not store:
                    errors.append(f"Row {idx + 2}: Store ID {emp_store_id} not found")
                    skipped += 1
                    continue

                # Parse hire_date
                hire_date = date.today()
                if 'hire_date' in df.columns and pd.notna(row.get('hire_date')):
                    try:
                        hire_date = pd.to_datetime(row['hire_date']).date()
                    except:
                        pass

                # Parse status
                emp_status = EmployeeStatus.ACTIVE
                if 'status' in df.columns and pd.notna(row.get('status')):
                    status_str = str(row['status']).lower()
                    if status_str in ['inactive', 'disabled']:
                        emp_status = EmployeeStatus.INACTIVE
                    elif status_str in ['leave', 'on_leave', 'on leave']:
                        emp_status = EmployeeStatus.ON_LEAVE

                # Generate password (use email prefix or default)
                default_password = row['email'].split('@')[0] + "123"

                # Create user
                user = User(
                    email=row['email'],
                    password_hash=get_password_hash(default_password),
                    role=UserRole.EMPLOYEE
                )
                db.add(user)
                db.flush()

                # Create employee
                employee = Employee(
                    user_id=user.id,
                    store_id=emp_store_id,
                    first_name=str(row['first_name']).strip(),
                    last_name=str(row['last_name']).strip(),
                    hire_date=hire_date,
                    status=emp_status
                )
                db.add(employee)
                created += 1

            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")
                skipped += 1

        db.commit()

        return {
            "success": True,
            "created": created,
            "skipped": skipped,
            "total_rows": len(df),
            "errors": errors[:20] if errors else []  # Return first 20 errors
        }

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="File is empty")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/import/historical-orders")
async def import_historical_orders(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Bulk import historical order data from CSV or Excel file.

    Required columns: store_id OR store_code, date, hour, order_count
    Optional columns: day_of_week (auto-calculated if not provided)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Supported formats: CSV, XLSX, XLS"
        )

    try:
        content = await file.read()

        if filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))

        # Validate required columns
        has_store_id = 'store_id' in df.columns
        has_store_code = 'store_code' in df.columns

        if not has_store_id and not has_store_code:
            raise HTTPException(
                status_code=400,
                detail="Missing required column: store_id or store_code"
            )

        required_cols = ['date', 'hour', 'order_count']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required columns: {', '.join(missing_cols)}"
            )

        # Get store mapping
        stores = db.query(Store).all()
        store_id_map = {s.id: s for s in stores}
        store_code_map = {s.code: s.id for s in stores}

        # Process rows
        records = []
        errors = []

        for idx, row in df.iterrows():
            try:
                # Determine store_id
                if has_store_id and pd.notna(row.get('store_id')):
                    s_id = int(row['store_id'])
                    if s_id not in store_id_map:
                        errors.append(f"Row {idx + 2}: Invalid store_id {s_id}")
                        continue
                elif has_store_code and pd.notna(row.get('store_code')):
                    s_id = store_code_map.get(row['store_code'])
                    if not s_id:
                        errors.append(f"Row {idx + 2}: Unknown store_code {row['store_code']}")
                        continue
                else:
                    errors.append(f"Row {idx + 2}: No store specified")
                    continue

                # Parse date
                order_date = pd.to_datetime(row['date']).date()

                # Parse hour
                hour = int(row['hour'])
                if hour < 0 or hour > 23:
                    errors.append(f"Row {idx + 2}: Invalid hour {hour}")
                    continue

                # Parse order_count
                order_count = float(row['order_count'])
                if order_count < 0:
                    order_count = 0

                # Calculate day_of_week if not provided
                if 'day_of_week' in df.columns and pd.notna(row.get('day_of_week')):
                    dow = int(row['day_of_week'])
                else:
                    dow = order_date.weekday()

                records.append(HistoricalOrder(
                    store_id=s_id,
                    date=order_date,
                    hour=hour,
                    order_count=round(order_count, 1),
                    day_of_week=dow
                ))

            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")

        # Bulk insert
        if records:
            db.bulk_save_objects(records)
            db.commit()

        return {
            "success": True,
            "imported": len(records),
            "errors_count": len(errors),
            "total_rows": len(df),
            "errors": errors[:20] if errors else []
        }

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="File is empty")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/import/availability")
async def import_availability(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """
    Bulk import employee availability from CSV or Excel file.

    Required columns: employee_id OR employee_email, day_of_week (0-6), is_available (true/false)
    Optional columns: preferred_start (HH:MM), preferred_end (HH:MM)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Invalid file type")

    try:
        content = await file.read()

        if filename.endswith('.csv'):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))

        # Build employee lookup
        employees = db.query(Employee).join(User).all()
        emp_by_id = {e.id: e for e in employees}
        emp_by_email = {e.user.email: e for e in employees}

        created = 0
        updated = 0
        errors = []

        for idx, row in df.iterrows():
            try:
                # Find employee
                emp = None
                if 'employee_id' in df.columns and pd.notna(row.get('employee_id')):
                    emp = emp_by_id.get(int(row['employee_id']))
                elif 'employee_email' in df.columns and pd.notna(row.get('employee_email')):
                    emp = emp_by_email.get(row['employee_email'])

                if not emp:
                    errors.append(f"Row {idx + 2}: Employee not found")
                    continue

                dow = int(row['day_of_week'])
                if dow < 0 or dow > 6:
                    errors.append(f"Row {idx + 2}: Invalid day_of_week {dow}")
                    continue

                is_available = str(row.get('is_available', 'true')).lower() in ['true', '1', 'yes', 'y']

                # Parse times
                pref_start = None
                pref_end = None
                if is_available:
                    if 'preferred_start' in df.columns and pd.notna(row.get('preferred_start')):
                        try:
                            pref_start = datetime.strptime(str(row['preferred_start']), '%H:%M').time()
                        except:
                            pref_start = time(8, 0)
                    if 'preferred_end' in df.columns and pd.notna(row.get('preferred_end')):
                        try:
                            pref_end = datetime.strptime(str(row['preferred_end']), '%H:%M').time()
                        except:
                            pref_end = time(22, 0)

                # Check if exists
                existing = db.query(Availability).filter(
                    and_(
                        Availability.employee_id == emp.id,
                        Availability.day_of_week == dow
                    )
                ).first()

                if existing:
                    existing.is_available = is_available
                    existing.preferred_start = pref_start
                    existing.preferred_end = pref_end
                    updated += 1
                else:
                    avail = Availability(
                        employee_id=emp.id,
                        day_of_week=dow,
                        is_available=is_available,
                        preferred_start=pref_start,
                        preferred_end=pref_end
                    )
                    db.add(avail)
                    created += 1

            except Exception as e:
                errors.append(f"Row {idx + 2}: {str(e)}")

        db.commit()

        return {
            "success": True,
            "created": created,
            "updated": updated,
            "total_rows": len(df),
            "errors": errors[:20]
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@router.get("/export/employees")
async def export_employees(
    store_id: Optional[int] = Query(None),
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Export employees to CSV or Excel."""
    query = db.query(Employee).join(User).join(Store)

    if store_id:
        query = query.filter(Employee.store_id == store_id)

    employees = query.all()

    data = []
    for emp in employees:
        data.append({
            "employee_id": emp.id,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "email": emp.user.email,
            "store_id": emp.store_id,
            "store_name": emp.store.name,
            "store_code": emp.store.code,
            "hire_date": emp.hire_date.isoformat(),
            "status": emp.status.value
        })

    df = pd.DataFrame(data)

    if format == "xlsx":
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=employees.xlsx"}
        )
    else:
        output = StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=employees.csv"}
        )


@router.get("/export/schedule/{schedule_id}")
async def export_schedule(
    schedule_id: int,
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Export a schedule with all shifts to CSV or Excel."""
    schedule = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    shifts = db.query(Shift).filter(Shift.schedule_id == schedule_id).all()

    data = []
    for shift in shifts:
        employee = db.query(Employee).filter(Employee.id == shift.employee_id).first()
        data.append({
            "date": shift.date.isoformat(),
            "day_of_week": shift.date.strftime("%A"),
            "employee_id": shift.employee_id,
            "employee_name": f"{employee.first_name} {employee.last_name}" if employee else "Unknown",
            "start_time": shift.start_time.strftime("%H:%M"),
            "end_time": shift.end_time.strftime("%H:%M"),
            "break_minutes": shift.break_minutes,
            "status": shift.status.value,
            "hours": round((datetime.combine(date.today(), shift.end_time) -
                          datetime.combine(date.today(), shift.start_time)).seconds / 3600, 2)
        })

    df = pd.DataFrame(data)

    # Sort by date and start time
    if not df.empty:
        df = df.sort_values(['date', 'start_time'])

    store = db.query(Store).filter(Store.id == schedule.store_id).first()
    filename = f"schedule_{store.code}_{schedule.week_start_date.isoformat()}"

    if format == "xlsx":
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='Shifts', index=False)

            # Add summary sheet
            summary_data = {
                "Store": [store.name],
                "Week Start": [schedule.week_start_date.isoformat()],
                "Status": [schedule.status.value],
                "Total Shifts": [len(shifts)],
                "Total Hours": [df['hours'].sum() if not df.empty else 0],
                "Unique Employees": [df['employee_id'].nunique() if not df.empty else 0]
            }
            summary_df = pd.DataFrame(summary_data)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)

        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
        )
    else:
        output = StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )


@router.get("/export/labor-report")
async def export_labor_report(
    store_id: int,
    start_date: date,
    end_date: date,
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_admin)
):
    """Export labor cost report to CSV or Excel."""
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    # Get shifts in date range
    shifts = db.query(Shift).join(Schedule).filter(
        and_(
            Schedule.store_id == store_id,
            Shift.date >= start_date,
            Shift.date <= end_date,
            Shift.status.in_([ShiftStatus.SCHEDULED, ShiftStatus.COVERED])
        )
    ).all()

    # Build employee data
    employee_hours = {}
    daily_data = []

    for shift in shifts:
        emp = db.query(Employee).filter(Employee.id == shift.employee_id).first()
        hours = (datetime.combine(date.today(), shift.end_time) -
                datetime.combine(date.today(), shift.start_time)).seconds / 3600
        hours -= shift.break_minutes / 60

        # Daily breakdown
        daily_data.append({
            "date": shift.date.isoformat(),
            "employee_id": shift.employee_id,
            "employee_name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
            "start_time": shift.start_time.strftime("%H:%M"),
            "end_time": shift.end_time.strftime("%H:%M"),
            "hours": round(hours, 2),
            "status": shift.status.value
        })

        # Employee totals
        if shift.employee_id not in employee_hours:
            employee_hours[shift.employee_id] = {
                "name": f"{emp.first_name} {emp.last_name}" if emp else "Unknown",
                "total_hours": 0,
                "shifts": 0
            }
        employee_hours[shift.employee_id]["total_hours"] += hours
        employee_hours[shift.employee_id]["shifts"] += 1

    daily_df = pd.DataFrame(daily_data)

    # Employee summary
    emp_summary = []
    for emp_id, data in employee_hours.items():
        regular = min(data["total_hours"], 44)
        overtime = max(0, data["total_hours"] - 44)
        emp_summary.append({
            "employee_id": emp_id,
            "employee_name": data["name"],
            "total_shifts": data["shifts"],
            "regular_hours": round(regular, 2),
            "overtime_hours": round(overtime, 2),
            "total_hours": round(data["total_hours"], 2)
        })

    emp_df = pd.DataFrame(emp_summary)

    filename = f"labor_report_{store.code}_{start_date.isoformat()}_to_{end_date.isoformat()}"

    if format == "xlsx":
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            if not daily_df.empty:
                daily_df.to_excel(writer, sheet_name='Daily Detail', index=False)
            if not emp_df.empty:
                emp_df.to_excel(writer, sheet_name='Employee Summary', index=False)

            # Summary
            summary = {
                "Store": [store.name],
                "Period": [f"{start_date} to {end_date}"],
                "Total Shifts": [len(shifts)],
                "Total Hours": [round(sum(e["total_hours"] for e in employee_hours.values()), 2)],
                "Unique Employees": [len(employee_hours)]
            }
            pd.DataFrame(summary).to_excel(writer, sheet_name='Summary', index=False)

        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
        )
    else:
        output = StringIO()
        daily_df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )


@router.get("/export/template/{template_type}")
async def export_template(
    template_type: str,
    format: str = Query("csv", regex="^(csv|xlsx)$")
):
    """
    Download import template files.

    Template types: employees, historical_orders, availability
    """
    templates = {
        "employees": {
            "columns": ["first_name", "last_name", "email", "store_code", "hire_date", "status"],
            "sample_data": [
                ["John", "Doe", "john.doe@example.com", "DTP-001", "2024-01-15", "active"],
                ["Jane", "Smith", "jane.smith@example.com", "WSM-002", "2024-02-20", "active"]
            ]
        },
        "historical_orders": {
            "columns": ["store_code", "date", "hour", "order_count"],
            "sample_data": [
                ["DTP-001", "2024-12-01", 10, 15.5],
                ["DTP-001", "2024-12-01", 11, 22.3],
                ["DTP-001", "2024-12-01", 12, 28.7]
            ]
        },
        "availability": {
            "columns": ["employee_email", "day_of_week", "is_available", "preferred_start", "preferred_end"],
            "sample_data": [
                ["john.doe@example.com", 0, "true", "08:00", "17:00"],
                ["john.doe@example.com", 1, "true", "09:00", "18:00"],
                ["john.doe@example.com", 6, "false", "", ""]
            ]
        }
    }

    if template_type not in templates:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template type. Available: {', '.join(templates.keys())}"
        )

    template = templates[template_type]
    df = pd.DataFrame(template["sample_data"], columns=template["columns"])

    filename = f"{template_type}_template"

    if format == "xlsx":
        output = BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"}
        )
    else:
        output = StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )
