from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.employee import Employee
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.api.deps import require_manager_or_admin, get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/", response_model=List[EmployeeResponse])
async def list_employees(
    store_id: int = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List employees. Can filter by store_id."""
    query = db.query(Employee)
    if store_id:
        query = query.filter(Employee.store_id == store_id)
    employees = query.offset(skip).limit(limit).all()
    return employees


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: int, db: Session = Depends(get_db)):
    """Get a specific employee by ID."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.post("/", response_model=EmployeeResponse, dependencies=[Depends(require_manager_or_admin)])
async def create_employee(employee_data: EmployeeCreate, db: Session = Depends(get_db)):
    """Create a new employee (manager/admin only)."""
    employee = Employee(**employee_data.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.patch("/{employee_id}", response_model=EmployeeResponse, dependencies=[Depends(require_manager_or_admin)])
async def update_employee(
    employee_id: int,
    employee_data: EmployeeUpdate,
    db: Session = Depends(get_db)
):
    """Update an employee (manager/admin only)."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = employee_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)

    db.commit()
    db.refresh(employee)
    return employee
